# TaskFlow

A collaborative task and scheduling platform built as a take-home assignment. Workspaces with multi-role members, projects, tasks with nested subtasks, comments, activity logs, async notifications, real-time updates, and the whole thing runs with one `docker-compose up`.

Built with NestJS, PostgreSQL, Redis, BullMQ, and Socket.IO.

---

## What's inside

**Auth & RBAC**
- Signup, login, refresh, logout
- JWT access tokens (15 min) with refresh tokens (7 days)
- Refresh tokens are hashed (SHA-256) in the DB and rotated on every use
- Two role layers: a system role on the user (`ADMIN` / `MEMBER`) and a workspace-level role on each membership (`OWNER` / `ADMIN` / `MEMBER`)

**Workspaces, Projects, Tasks**
- Workspaces are the multi-tenant boundary — every project, task, comment, and activity lives inside one
- Workspace creation is transactional: the creator's `OWNER` membership is inserted in the same transaction as the workspace itself
- Member invitations are idempotent at the database level (unique constraint on `workspace_members(workspaceId, userId)`)
- Tasks have status (`TODO` / `IN_PROGRESS` / `IN_REVIEW` / `DONE` / `CANCELLED`), priority, due date, assignee (must be a workspace member), and creator
- Every service-level query joins through to the workspace to prevent IDOR attacks — not just the immediate parent

**Nested subtasks**
- Self-referencing FK on `tasks.parentTaskId`
- Subtree fetched in one query with a recursive CTE (`WITH RECURSIVE`)
- Depth capped at 5 levels
- Cycle prevention on parent change (walks ancestors before allowing the move)

**Comments**
- One-level threading — replies are allowed, replies-to-replies are rejected
- Author-only edit and delete
- `@email` mentions (e.g. `@alice@example.com`) → workspace-scoped user lookup → notification queued

**Activity log**
- Polymorphic event store: `type`, `entityType`, `entityId`, JSONB `payload`
- Names denormalized into the payload at write time so the feed renders without N+1 lookups
- Composite index on `(workspaceId, createdAt)` for the workspace feed query

**Async notifications**
- BullMQ on Redis, exponential backoff retry (5 attempts: 2s → 4s → 8s → 16s → 32s)
- Job types: `task_assigned`, `due_reminder`, `comment_mention`, `status_changed`
- Persisted notifications carry human-readable `title` + `body` so the client renders without business logic
- Real-time push: the gateway emits the notification to a `user:{userId}` room if the recipient is connected

**Scheduler**
- Cron scans every 5 minutes for tasks due in the next 60 minutes
- Uses the `IDX_tasks_dueAt` index
- BullMQ `jobId` deduplication (`due_reminder:{taskId}:{hourWindow}`) means at most one reminder per task per hour, even if the scan overlaps

**Real-time (Socket.IO)**
- JWT-authenticated gateway
- Per-user rooms (`user:{userId}`) so notifications only fan out to the right person

**Production tooling**
- Multi-stage Dockerfile (builder + production)
- `docker-compose.yml` orchestrates app + Postgres + Redis with health checks
- `entrypoint.sh` runs migrations before the app starts
- Swagger UI at `/api/docs`
- Healthcheck at `/health`
- TypeORM migrations everywhere — `synchronize` is `false`

---

## Quick start

You need Docker Desktop running. That's it.

```bash
git clone <your-repo-url> taskflow
cd taskflow

# Copy the env template
cp .env.example .env.docker
# Edit .env.docker if you want to change credentials or generate stronger secrets

# Build and start everything
docker-compose --env-file .env.docker up --build
```

Three containers come up:

| Service | Port | Purpose |
| --- | --- | --- |
| `app` | 3000 | NestJS API |
| `postgres` | 5432 | Database |
| `redis` | 6379 | Job queue + cache |

Migrations run automatically through `entrypoint.sh`. First boot takes ~3 minutes (image pulls + npm install + TypeScript build).

**Check it's alive:**

```bash
curl http://localhost:3000/health
# { "status": "ok", "timestamp": "..." }
```

**Open the API docs:**

```
http://localhost:3000/api/docs
```

**Stop:**

```bash
docker-compose down       # stop containers, keep data
docker-compose down -v    # stop and wipe Postgres data
```

---

## Local development (without Docker for the app)

If you want the watcher loop for fast iteration, run Postgres and Redis in Docker but the app on bare metal:

```bash
# Start only the dependencies
docker run -d --name taskflow-pg \
  -e POSTGRES_USER=taskflow_user \
  -e POSTGRES_PASSWORD=taskflow_pass \
  -e POSTGRES_DB=taskflow_db \
  -p 5432:5432 \
  postgres:16-alpine

docker run -d --name taskflow-redis \
  -p 6379:6379 \
  redis:7-alpine

# Install deps
npm install

# Copy env
cp .env.example .env

# Run migrations
npm run migration:run

# Start with watcher
npm run start:dev
```

App on `http://localhost:3000`. Saves trigger a recompile.

---

## End-to-end smoke test

After `docker-compose up`, run this in another terminal to exercise the full stack — register two users, create a workspace, invite, create a task, and watch the notification land.

```bash
# Register Alice — she becomes OWNER of her workspace
ALICE=$(curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","password":"Secret123!"}' \
  | jq -r '.tokens.accessToken')

# Register Bob
BOB=$(curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob","email":"bob@example.com","password":"Secret123!"}' \
  | jq -r '.tokens.accessToken')

# Alice creates a workspace
WS_ID=$(curl -s -X POST http://localhost:3000/workspaces \
  -H "Authorization: Bearer $ALICE" \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme Engineering"}' \
  | jq -r '.id')

# Invite Bob
curl -X POST http://localhost:3000/workspaces/$WS_ID/members \
  -H "Authorization: Bearer $ALICE" \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com","role":"MEMBER"}'

# Create a project
PROJ_ID=$(curl -s -X POST http://localhost:3000/workspaces/$WS_ID/projects \
  -H "Authorization: Bearer $ALICE" \
  -H "Content-Type: application/json" \
  -d '{"name":"Q4 Launch"}' \
  | jq -r '.id')

# Get Bob's user id
BOB_ID=$(curl -s http://localhost:3000/users/me \
  -H "Authorization: Bearer $BOB" \
  | jq -r '.id')

# Create a task assigned to Bob — triggers a notification job
curl -X POST http://localhost:3000/workspaces/$WS_ID/projects/$PROJ_ID/tasks \
  -H "Authorization: Bearer $ALICE" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Wire up auth\",\"priority\":\"HIGH\",\"assigneeId\":\"$BOB_ID\"}"

# Bob checks his notifications
curl http://localhost:3000/notifications \
  -H "Authorization: Bearer $BOB"
```

Bob's notifications response contains a `task_assigned` entry with a readable `title` ("New task assigned") and `body` ("\"Wire up auth\" was assigned to you"). No UUID is exposed in the rendered text — names are denormalized into the payload at queue time so the client doesn't need to do lookups.

---

## API overview

Full interactive docs at `http://localhost:3000/api/docs` (Swagger UI generated from `@ApiProperty` decorators).

| Group | Routes |
| --- | --- |
| **Auth** | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` |
| **Users** | `GET /users/me`, `GET /users/admin-only` |
| **Workspaces** | `POST /workspaces`, `GET /workspaces`, `GET /workspaces/:id`, `GET /workspaces/:id/members`, `POST /workspaces/:id/members`, `PATCH /workspaces/:id/members/:memberId`, `DELETE /workspaces/:id/members/:memberId` |
| **Projects** | `POST/GET/PATCH/DELETE /workspaces/:workspaceId/projects[/:id]` |
| **Tasks** | `POST/GET/PATCH/DELETE /workspaces/:workspaceId/projects/:projectId/tasks[/:id]` |
| **Subtasks** | `GET /workspaces/:workspaceId/projects/:projectId/tasks/:id/subtree` |
| **Comments** | `POST/GET/PATCH/DELETE /workspaces/:workspaceId/projects/:projectId/tasks/:taskId/comments[/:id]` |
| **Activities** | `GET /workspaces/:workspaceId/activities`, `GET /workspaces/:workspaceId/activities/task/:taskId` |
| **Notifications** | `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` |
| **Health** | `GET /health` |

Everything except `/auth/*` and `/health` requires `Authorization: Bearer <accessToken>`.

---

## WebSocket events

Connect with the JWT in the handshake:

```javascript
const socket = io('http://localhost:3000', {
  auth: { token: '<accessToken>' }
});

socket.on('notification', (data) => {
  console.log('New notification:', data);
});
```

The gateway authenticates the token, joins the client to `user:{userId}`, and the notifications processor emits to that room after persisting a notification. If the user isn't connected, they'll still see it in `GET /notifications` next time they fetch.

---

## Architecture

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the longer write-up — module boundaries, the multi-tenancy model, why the activity log is polymorphic, how the recursive CTE works, how scaling would look, and the trade-offs taken.

ER diagram: **[docs/er-diagram.png](./docs/er-diagram.png)** (source in `docs/er-diagram.md` for dbdiagram.io).

---

## Project structure

```
taskflow/
├── src/
│   ├── auth/              JWT strategy, guards, decorators, register/login/refresh/logout
│   ├── users/             User entity, /users/me
│   ├── workspaces/        Workspace + WorkspaceMember entities, WorkspaceMemberGuard
│   ├── projects/          Project entity, workspace-scoped CRUD
│   ├── tasks/             Task entity, recursive CTE for subtree, IDOR-safe scoping
│   ├── comments/          Threaded comments, @email mention parsing
│   ├── activities/        Polymorphic activity log
│   ├── notifications/     Notification entity, controller, BullMQ processor
│   ├── queues/            BullMQ setup, shared queue constants, payload types
│   ├── scheduler/         Cron: due-soon scanner
│   ├── gateway/           Socket.IO with JWT auth
│   ├── health/            Healthcheck endpoint
│   ├── database/          TypeORM module setup
│   ├── migrations/        All migrations (10 of them)
│   ├── app.module.ts
│   ├── data-source.ts
│   └── main.ts
├── Dockerfile             Multi-stage (builder → production)
├── docker-compose.yml     App + Postgres + Redis with health checks
├── entrypoint.sh          Runs migrations, then exec node dist/main.js
├── .env.example           Env template (committed to git)
└── package.json
```

---

## Environment variables

`.env.example` is the canonical template. Copy it to `.env` for local dev or `.env.docker` for Docker. Both are gitignored.

| Variable | Description | Example |
| --- | --- | --- |
| `NODE_ENV` | `development` / `production` | `production` |
| `PORT` | API port | `3000` |
| `DB_HOST` | Postgres host | `postgres` (Docker) / `localhost` (dev) |
| `DB_PORT` | Postgres port | `5432` |
| `DB_USERNAME` | Postgres user | `taskflow_user` |
| `DB_PASSWORD` | Postgres password | `taskflow_pass` |
| `DB_DATABASE` | Database name | `taskflow_db` |
| `REDIS_HOST` | Redis host | `redis` (Docker) / `localhost` (dev) |
| `REDIS_PORT` | Redis port | `6379` |
| `JWT_ACCESS_SECRET` | Secret for access tokens | Generate with `openssl rand -base64 32` |
| `JWT_ACCESS_EXPIRES_IN` | Access TTL | `15m` |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens | Generate separately |
| `JWT_REFRESH_EXPIRES_IN` | Refresh TTL | `7d` |

In `docker-compose.yml`, Postgres credentials are referenced as `${DB_USERNAME}` etc. — no secret is hardcoded in any committed file.

---

## Tech stack

- **NestJS 11** — modules, controllers, providers
- **PostgreSQL 16** — TypeORM, migrations only (no `synchronize`)
- **Redis 7 + BullMQ** — job queue with exponential backoff retry
- **Socket.IO** — JWT-authenticated real-time push
- **Passport + JWT** — auth strategy; bcrypt for password hashing
- **class-validator** — DTO validation, global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`
- **Swagger / OpenAPI** — interactive docs at `/api/docs`
- **Docker + Docker Compose** — multi-stage build, single-command spin-up
- **TypeScript 5**

---

## Notes on what's evaluated

The assignment lists nested subtasks, async workflow design, PostgreSQL modeling, and Docker as high-weight criteria. Where each lives:

- **Nested subtasks** → `src/tasks/tasks.service.ts`, methods `getSubtree`, `getDepth`, `isAncestor`. Recursive CTE in raw SQL with depth and cycle protection.
- **Async workflow** → `src/queues/`, `src/scheduler/`, `src/notifications/`. BullMQ with exponential backoff, cron scanner, dedicated processor.
- **PostgreSQL modeling** → see `src/migrations/` (10 migrations), composite indexes on hot query paths (`IDX_tasks_project_status`, `IDX_tasks_assignee_status`, `IDX_tasks_dueAt`, `IDX_activities_workspace_created`), self-referencing FK for subtasks, separate `workspace_members` join table with role enum.
- **Docker** → `Dockerfile` (multi-stage), `docker-compose.yml`, `entrypoint.sh`. App + Postgres + Redis come up with `docker-compose --env-file .env.docker up --build`.

Background and design rationale for each of these is in [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## License

UNLICENSED — submission artifact for assignment review.