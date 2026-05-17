# Architecture

This document explains the major design decisions in TaskFlow, the trade-offs taken, and how the system would evolve if scaled beyond its current single-server footprint.

It's organized around the parts of the assignment that carry the most weight: multi-tenancy, nested subtasks, async workflow, the database model, and Docker.

---

## Overview

TaskFlow is a NestJS backend backed by PostgreSQL for durable state and Redis for queue and pub/sub. It exposes a REST API and a Socket.IO gateway. Background work — notifications, due-soon reminders — runs on BullMQ workers that share the same Node process today but can be split out without code changes.

```
   ┌─────────────────────┐
   │   HTTP / WebSocket  │
   │   clients           │
   └──────────┬──────────┘
              │
       (REST + Socket.IO)
              │
   ┌──────────▼──────────┐         ┌──────────────┐
   │                     │ enqueue │              │
   │   NestJS API +      │────────▶│  Redis       │
   │   BullMQ workers    │ consume │  (BullMQ)    │
   │   (single process)  │◀────────│              │
   │                     │         └──────────────┘
   │   Socket.IO gateway │
   └──────────┬──────────┘
              │ SQL
              ▼
   ┌─────────────────────┐
   │   PostgreSQL 16     │
   └─────────────────────┘
```

The three containers are wired together in `docker-compose.yml`. In production, the workers and gateway would split into separate processes; today they share one for simplicity.

---

## Multi-tenancy

Every domain resource is scoped to a workspace. Projects belong to workspaces. Tasks belong to projects. Comments belong to tasks. Activities and notifications carry a `workspaceId` directly.

Two role layers exist because they answer different questions:

- **System role** on `users.role` — `ADMIN` / `MEMBER`. Controls platform-level concerns ("can hit `/users/admin-only`"). The vast majority of users are `MEMBER`.
- **Workspace role** on `workspace_members.role` — `OWNER` / `ADMIN` / `MEMBER`. Controls what the user can do inside a specific workspace.

A user can be a system `MEMBER`, OWNER of three workspaces, and MEMBER of seven others. Folding these into one column would be impossible.

### Authorization layers

There are two enforcement layers, intentionally redundant:

1. **`WorkspaceMemberGuard`** (`src/workspaces/guards/workspace-member.guard.ts`) — runs before any workspace-scoped route. Reads `workspaceId` from the URL, looks up the membership row, attaches it to `req.workspaceMembership`, throws 403 if the caller isn't a member.

2. **Service-level query scoping** — every read or write joins through to the workspace, not just the immediate parent. The cleanest example is `TasksService.assertTaskInWorkspace`:

   ```ts
   .innerJoin('projects', 'p', 'p.id = t."projectId"')
   .where('t.id = :taskId', { taskId })
   .andWhere('t.projectId = :projectId', { projectId })
   .andWhere('p."workspaceId" = :workspaceId', { workspaceId })
   ```

The second layer matters because a guard checks only what's in the URL. A request like `/workspaces/{my-workspace}/projects/{someone-else's-project}/tasks/{their-task}` passes the guard (the caller is a member of their own workspace) but should still 404. The join-through prevents this category of IDOR (Insecure Direct Object Reference) bug — number one item on the OWASP API Security Top 10.

Both layers exist on purpose: if one ever has a bug, the other catches the request.

### Idempotent invitations

`workspace_members` has a unique constraint on `(workspaceId, userId)`. Two concurrent invite requests for the same user produce a Postgres unique-violation on the loser, which the service surfaces as `409 Conflict`. This is race-condition-proof by construction — no application-level locking required.

### Transactional workspace creation

`WorkspacesService.create` wraps the workspace `INSERT` and the owner `WorkspaceMember` `INSERT` in a `dataSource.transaction(...)`. Either both rows commit or neither does. Without the transaction, a partial failure between the two inserts would leave a "phantom workspace" with no owner and no members — unreachable by every authorization check downstream.

---

## Nested subtasks

The assignment explicitly calls out nested subtasks as evaluated, so the approach taken here is worth describing carefully.

### Storage model: adjacency list

Tasks have a nullable `parentTaskId` foreign key referencing `tasks.id`. A NULL means "top-level task in this project"; any other value means "subtask of this parent".

There are three common ways to model hierarchical data in SQL:

| Approach | Read whole tree | Insert / move | Notes |
| --- | --- | --- | --- |
| **Adjacency list** (what we use) | Recursive CTE | O(1) per node | Simple, native Postgres support |
| Path enumeration | One indexed query | Rewrites on every move | Annoying updates |
| Nested sets | Single range query | Whole-tree rebalance | Read-heavy systems only |

For task trees in a project tool — realistic depth under 20, more writes than reads, frequent moves — adjacency list with a recursive CTE is the right call.

### The recursive CTE

`TasksService.getSubtree`:

```sql
WITH RECURSIVE tree AS (
  SELECT *, 0 AS depth
  FROM tasks WHERE id = $1
  UNION ALL
  SELECT t.*, tree.depth + 1
  FROM tasks t
  INNER JOIN tree ON t."parentTaskId" = tree.id
  WHERE tree.depth < $2
)
SELECT * FROM tree ORDER BY depth ASC, "createdAt" ASC;
```

The anchor (`SELECT * FROM tasks WHERE id = $1`) seeds the recursion with the root. Each iteration joins back to results from the previous step. Postgres builds the whole subtree in a single query.

The `WHERE tree.depth < $2` guard is critical. Without it, a malformed cycle (which our cycle check should prevent, but defense in depth) would recurse forever. The depth cap is set to `MAX_SUBTASK_DEPTH + 1` so we can detect "too deep" without overshooting catastrophically.

### Constraints enforced

`src/tasks/tasks.service.ts` checks three rules on every subtask operation:

1. **Same project** — `parentTaskId` and the new task's `projectId` must match. Subtasks can't span projects.
2. **Depth cap** — the parent's depth must be less than `MAX_SUBTASK_DEPTH` (currently 5). At 5 levels you're usually modeling something other than a task hierarchy.
3. **No cycles** — when changing a parent, `isAncestor()` walks up the new parent's chain. If the task being moved appears anywhere in that chain, the move is rejected ("Cannot move a task under its own descendant"). A task can't be its own parent either.

The return shape is a **flat list with depth**, not a nested JSON tree. Two reasons:
- Clients can build either — a flat list is strictly more information than a tree.
- Flat lists are pagination-friendly. Trees aren't.

### What would change at scale

Adjacency list + CTE comfortably handles trees with tens of thousands of subtasks per workspace. Past that, the read pattern degrades because the CTE has to walk the whole subtree each time. The fix is materialized path — store `path = "root/childA/grandchildB"` as a separate column, indexed with a trigram or btree on `path text_pattern_ops`. Reads become a single indexed prefix query. Writes get more expensive on moves (rewrite all descendants' paths) — but that's the right trade for read-heavy workloads.

I didn't implement materialized path because the simpler adjacency-list version is enough for the assignment's scope, and the trade-off isn't worth the added complexity until query patterns prove it's needed.

---

## Activity log

Every meaningful state change writes a row to `activities`: task created, status changed, member added, comment posted. Three things this enables:

- Audit trail (who did what, when)
- Activity feed UI (real-time and historical)
- Source events for notifications (the next layer)

### Polymorphic schema

One table covers all event types:

| Column | Type | Notes |
| --- | --- | --- |
| `type` | `varchar(64)` | e.g. `task.status_changed` |
| `entityType` | `varchar(32)` | `task` / `comment` / `workspace_member` |
| `entityId` | `uuid` | the thing acted upon |
| `payload` | `jsonb` | type-specific fields |

Alternative: one table per event type. Clean per-type queries, but the dominant query is "give me everything that happened in this workspace recently" — across all types. With per-type tables, that's a 10-way UNION. Polymorphic with JSONB is one indexed query.

The trade-off accepted: queries that filter inside the payload (e.g. "every status change from TODO to DONE") are slower than they'd be with dedicated columns. Acceptable because the dominant query is the unified feed, not the introspective per-type query.

### Names denormalized into payload

A subtle but important decision: payloads carry both IDs *and* names. For an assignment activity:

```json
{
  "from": null,
  "to": "<bob-uuid>",
  "fromName": null,
  "toName": "Bob",
  "taskTitle": "Wire up auth"
}
```

The IDs are there for clickable links. The names are there so the UI renders without N+1 lookups. Frontend just reads `payload.toName` directly.

It also gives audit-log immutability: if Bob renames himself to "Robert" six months from now, historical activities still say "Bob assigned task" — which is correct, because that's who he was at the time.

### Indexes

- `IDX_activities_workspace_created (workspaceId, createdAt)` — the workspace feed. Composite ordering matches the query: equality on `workspaceId`, range/sort on `createdAt`.
- `IDX_activities_entity (entityType, entityId)` — "history for this task / this comment".

---

## Async workflow

The reason notifications are async: a comment with 5 mentions involves 5 user lookups + 5 notification inserts + 5 WebSocket emits. Synchronously, the user waits ~250ms for the API response and a single failure (DB hiccup, gateway disconnect) can fail the whole comment.

Queued, the user waits ~55ms — the comment is saved and the jobs are enqueued. Workers pick them up. Failures isolated. BullMQ retries with exponential backoff (5 attempts: 2s → 4s → 8s → 16s → 32s, configured in `app.module.ts`).

### Job types

| Name | Triggered by | Recipient |
| --- | --- | --- |
| `task_assigned` | `TasksService.create` or `update` when assignee changes | the new assignee |
| `due_reminder` | `TaskSchedulerService` cron | the assignee |
| `comment_mention` | `CommentsService.create` when `@email` parsed | the mentioned user |
| `status_changed` | `TasksService.update` when status changes | the assignee |

Payload types are in `src/queues/job-payloads.ts` — a discriminated union keyed by the BullMQ job name.

### Deduplication

The due-reminder cron runs every 5 minutes and scans for tasks due in the next 60 minutes. A task that's due in 30 minutes will appear in 12 successive scans. Without dedup, the user would get 12 reminders.

The fix: BullMQ's `jobId` deduplication. The scheduler computes a deterministic id:

```ts
jobId: `due_reminder:${task.id}:${hourWindow}`
```

`hourWindow` is the current ISO hour (`2026-05-17T03`). If a job with that id is already in the queue, `add()` is a silent no-op. Across the same hour, only the first reminder ever gets queued. New hour → new id → new reminder.

This is far cleaner than tracking sent-state in the DB.

### Why one process today

The current Docker image runs the API server, the queue worker, and the gateway in the same Node process. That's the simplest possible deployment and fine for the assignment's scope.

The code is structured so the workers can split out without changes. The Dockerfile is reusable for a separate worker container — same image, different `CMD`. In a production environment I'd run:

- N API server replicas behind a load balancer
- M worker replicas (independent scaling axis — heavy queue load? add workers, not APIs)
- Managed Redis (AWS ElastiCache, Upstash, Redis Cloud) with cluster mode for high throughput
- Managed Postgres with read replicas

The architecture is shared-nothing: Redis is the only coordination point between API and workers, and Redis handles 100k+ ops/sec on a single instance.

---

## Real-time gateway

Notifications fire over Socket.IO when the recipient is connected. The gateway (`src/gateway/taskflow.gateway.ts`):

1. Reads the JWT from the connection handshake auth header
2. Verifies it (same secret as the HTTP JWT strategy)
3. Joins the socket to a `user:{userId}` room

When `NotificationsProcessor` persists a notification, it emits to `user:{recipientId}`. Only that user's connected sockets receive the event. Offline users see the same notification next time they hit `GET /notifications` — the persistence and the push are decoupled.

---

## PostgreSQL modeling

### Index strategy

Indexes were chosen based on actual query patterns, not blanket "index every FK". For each composite index, there's a specific query it serves:

| Index | Serves the query |
| --- | --- |
| `IDX_users_email` (unique) | Login by email |
| `IDX_workspace_members_workspaceId` | "All members of this workspace" |
| `IDX_workspace_members_userId` | "All workspaces this user is in" |
| `UQ_workspace_user` | Membership check (every authorized request) |
| `IDX_tasks_projectId` | Task list under a project |
| `IDX_tasks_project_status` | Filtered task list ("TODO tasks in project X") |
| `IDX_tasks_assignee_status` | "My open tasks" |
| `IDX_tasks_dueAt` | Due-reminder cron scan |
| `IDX_tasks_parentTaskId` | Recursive subtree CTE |
| `IDX_comments_task_created` | Comments on task, sorted by date |
| `IDX_activities_workspace_created` | Workspace activity feed |
| `IDX_activities_entity` | Per-entity history |
| `IDX_notifications_userId_createdAt` | User's notification inbox |

For composite indexes, the ordering matters: equality filter first, range/sort second. `IDX_tasks_project_status` is `(projectId, status)` because we query `WHERE projectId = ? AND status = ?` — `projectId` is the equality, `status` is the equality. Either order works for that. But for `IDX_activities_workspace_created (workspaceId, createdAt)`, `workspaceId` must come first because it's the equality filter and `createdAt` is the sort.

`EXPLAIN ANALYZE` confirms these indexes are used. For example, the task list query plan reads `Index Scan using "IDX_tasks_project_status"`, not `Seq Scan`.

### Migrations

All schema changes are explicit, versioned, reversible migrations in `src/migrations/`. `synchronize` is `false` everywhere. Both `data-source.ts` and `database.module.ts` make this explicit.

Each migration has both `up()` and `down()`. The hand-written ones (the notifications table — see commentary in the file) use `IF NOT EXISTS` / `IF EXISTS` on every DDL statement so they're safe to run multiple times and safe to revert partially.

### Foreign-key `ON DELETE` rules

The cascade rules are deliberate per relationship:

- `Workspace.owner → users(id) ON DELETE RESTRICT` — can't delete a user who owns workspaces; transfer ownership first.
- `Project.workspaceId → workspaces(id) ON DELETE CASCADE` — deleting a workspace deletes its projects.
- `Task.assigneeId → users(id) ON DELETE SET NULL` — deleted users' tasks survive, just unassigned. Different from project owners.
- `Task.parentTaskId → tasks(id) ON DELETE CASCADE` — deleting a task deletes its subtree.
- `RefreshToken.userId → users(id) ON DELETE CASCADE` — deleted user's sessions are scrubbed.

These rules express business intent at the schema level, not just in application code.

---

## Docker

The setup is a multi-stage `Dockerfile` and a `docker-compose.yml` for app + Postgres + Redis.

### Multi-stage Dockerfile

- **builder** stage runs `npm ci` (with devDependencies, needed for `tsc`) and `npm run build` to compile TypeScript into `dist/`.
- **production** stage runs `npm ci --omit=dev` (drops devDependencies — TypeScript compiler, Jest, etc.) and copies `dist/` from the builder.

The final image is smaller and contains no source TS files, no compilers, no test framework — only what's needed to run.

### entrypoint.sh

```sh
#!/bin/sh
set -e

echo "==> Running database migrations..."
./node_modules/.bin/typeorm migration:run -d dist/data-source.js

echo "==> Migrations complete. Starting TaskFlow..."
exec node dist/main.js
```

This is the right pattern for a container that depends on schema being in place. Migrations run on container start, fail loudly if the DB is unreachable, and the app boots only if they succeed.

### docker-compose.yml

Three services:

- `postgres` — image, named volume, healthcheck (`pg_isready`), credentials referenced from env vars
- `redis` — image, healthcheck (`redis-cli ping`)
- `app` — built from the local Dockerfile, depends on the other two with `condition: service_healthy` so it only starts after both are accepting connections

Postgres credentials are not hardcoded — `docker-compose.yml` references `${DB_USERNAME}`, `${DB_PASSWORD}`, `${DB_DATABASE}`. Values come from `.env.docker`, which is gitignored. `.env.example` is the committed template.

In dev, Postgres and Redis ports are exposed (`5432`, `6379`) for debugging with `psql` / `redis-cli`. In a real production setup these wouldn't be exposed at all — only the API port (3000, ideally behind a reverse proxy with TLS) would be.

---

## Validation, error handling, security

- **Global ValidationPipe** in `main.ts` with `whitelist: true` (strip unknown properties) and `forbidNonWhitelisted: true` (reject requests with extra properties). Prevents mass-assignment attacks where a client adds e.g. `ownerId` to a DTO that shouldn't accept it.
- **DTO-first** — every endpoint accepts a typed DTO with `class-validator` decorators. Sample: `RegisterDto` enforces email format, password min length, password complexity regex.
- **Passwords** — bcrypt with 10 rounds. Stored on `users.password` with `select: false` so they never leak into a normal `find()`.
- **Refresh tokens** — random 384-bit strings, stored SHA-256-hashed in `refresh_tokens`. Token rotation on use (old revoked, new issued). Logout marks the token revoked.
- **Login error parity** — wrong email and wrong password produce the same "Invalid credentials" response so the API can't be used for user enumeration.
- **UUIDs everywhere** — no auto-increment integers. Prevents leaking growth metrics ("user 1234 → this company has 1234 users") and makes IDs safe to expose in URLs.

---

## What I'd add next

A list of follow-ups that are out of scope for this submission but would be the natural next steps:

- **Tests** — at minimum unit tests for the recursive CTE (depth + cycle) and the workspace creation transaction. Phase 24 of my notes has these started but they're not in this submission.
- **Notification preferences** — per-user, per-type opt-out. Right now everyone gets everything they're targeted by.
- **`@username` mentions** — currently we parse `@email`. A `users.username` column with a unique index would be more user-friendly. Email works because it's already workspace-unique and validated.
- **Email delivery** — notifications are persisted and pushed via WebSocket but not emailed. A separate `email` BullMQ queue with retries and a transactional email provider (SES, Postmark) would close that.
- **CI/CD** — GitHub Actions for lint + test + build + image push. Image tags pinned to commit SHA.
- **Observability** — `pino` for structured logging, request IDs, Prometheus metrics for queue depth and job duration.
- **Cursor pagination on the activity feed** — current `LIMIT/OFFSET` works fine for now but degrades past low millions of rows. Switch to keyset pagination on `(createdAt, id)`.
- **Worker process separation** — split workers into a dedicated container so API replicas and worker replicas scale independently.

None of these block the assignment. They're the honest "if I had another week, here's what I'd build" list.

---

## File index

If you're reviewing the code, these are the files most worth reading:

- `src/tasks/tasks.service.ts` — recursive CTE, depth/cycle prevention, scoped queries, notification enqueue
- `src/workspaces/workspaces.service.ts` — transactional create, idempotent invitations, role enforcement
- `src/comments/comments.service.ts` — `@email` mention parsing, workspace-scoped lookup
- `src/notifications/notifications.processor.ts` — BullMQ consumer, title/body generation, gateway emit
- `src/scheduler/task-scheduler.service.ts` — cron, dedup-by-`jobId`
- `src/gateway/taskflow.gateway.ts` — JWT auth on connection, per-user rooms
- `src/auth/strategies/jwt.strategy.ts` — JWT verification
- `src/migrations/*` — schema history, in chronological order
- `docker-compose.yml` + `Dockerfile` + `entrypoint.sh` — the deployment story
