import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Task } from './task.entity';
import { Project } from '../projects/project.entity';
import { WorkspaceMember } from '../workspaces/workspace-member.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { TaskStatus } from './task-status.enum';
import { MAX_SUBTASK_DEPTH } from './task-tree.constants';
import { ActivitiesService } from '../activities/activities.service';
import { ActivityType, ActivityEntityType } from '../activities/activity-type.enum';
import { QUEUE_NOTIFICATIONS } from '../queues/queues.constants';
import { type TaskAssignedPayload, type StatusChangedPayload } from '../queues/job-payloads';

export interface PaginatedTasks {
    data: Task[];
    total: number;
    page: number;
    pageSize: number;
}

@Injectable()
export class TasksService {
    constructor(
        @InjectRepository(Task)
        private readonly taskRepo: Repository<Task>,

        @InjectRepository(Project)
        private readonly projectRepo: Repository<Project>,

        @InjectRepository(WorkspaceMember)
        private readonly memberRepo: Repository<WorkspaceMember>,

        @InjectRepository(User)                       // ← naya
        private readonly userRepo: Repository<User>,

        @InjectQueue(QUEUE_NOTIFICATIONS)
        private readonly notificationsQueue: Queue,

        private readonly activities: ActivitiesService,
    ) { }

    async create(
        workspaceId: string,
        projectId: string,
        dto: CreateTaskDto,
        createdById: string,
    ): Promise<Task> {
        // Confirm the project belongs to the workspace
        const project = await this.projectRepo.findOne({
            where: { id: projectId, workspaceId },
        });
        if (!project) throw new NotFoundException('Project not found');

        // If assignee given, confirm they're a workspace member.
        if (dto.assigneeId) {
            const member = await this.memberRepo.findOne({
                where: { workspaceId, userId: dto.assigneeId },
            });
            if (!member) {
                throw new BadRequestException('Assignee must be a workspace member');
            }
        }

        // If parentTaskId given, confirm it's in the same project.
        if (dto.parentTaskId) {
            const parent = await this.taskRepo.findOne({
                where: { id: dto.parentTaskId, projectId },
            });
            if (!parent) {
                throw new BadRequestException('Parent task not found in this project');
            }
            const parentDepth = await this.getDepth(dto.parentTaskId);
            if (parentDepth >= MAX_SUBTASK_DEPTH) {
                throw new BadRequestException(
                    `Subtasks cannot be nested deeper than ${MAX_SUBTASK_DEPTH} levels`,
                );
            }
        }

        const task = this.taskRepo.create({
            projectId,
            title: dto.title,
            description: dto.description ?? null,
            status: dto.status ?? TaskStatus.TODO,
            priority: dto.priority,
            dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
            assigneeId: dto.assigneeId ?? null,
            parentTaskId: dto.parentTaskId ?? null,
            createdById,
        });

        const saved = await this.taskRepo.save(task);

        // ── activity ──
        await this.activities.record({
            workspaceId,
            actorId: createdById,
            type: ActivityType.TASK_CREATED,
            entityType: ActivityEntityType.TASK,
            entityId: saved.id,
            payload: { title: saved.title, projectId: saved.projectId },
        });

        // ── notifications ──
        // ── notifications ──
        if (saved.assigneeId && saved.assigneeId !== createdById) {
            const assignedPayload: TaskAssignedPayload = {
                taskId: saved.id,
                taskTitle: saved.title,
                projectId: saved.projectId,
                workspaceId,
                assigneeId: saved.assigneeId,
                assignedById: createdById,
            };
            await this.notificationsQueue.add('task_assigned', assignedPayload);

            const assignee = await this.userRepo.findOne({
                where: { id: saved.assigneeId },
            });
            await this.activities.record({
                workspaceId,
                actorId: createdById,
                type: ActivityType.TASK_ASSIGNED,
                entityType: ActivityEntityType.TASK,
                entityId: saved.id,
                payload: {
                    from: null,
                    to: saved.assigneeId,
                    fromName: null,
                    toName: assignee?.name ?? null,
                    taskTitle: saved.title,
                },
            });
        }

        return saved;
    }

    async listInProject(
        workspaceId: string,
        projectId: string,
        query: ListTasksQueryDto,
    ): Promise<PaginatedTasks> {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;

        const qb = this.taskRepo
            .createQueryBuilder('t')
            .innerJoin('projects', 'p', 'p.id = t."projectId"')
            .where('p."workspaceId" = :workspaceId', { workspaceId })
            .andWhere('t.projectId = :projectId', { projectId })
            // Only top-level tasks by default — subtasks are fetched via the tree endpoint
            .andWhere('t.parentTaskId IS NULL');

        if (query.status) qb.andWhere('t.status = :status', { status: query.status });
        if (query.priority)
            qb.andWhere('t.priority = :priority', { priority: query.priority });
        if (query.assigneeId)
            qb.andWhere('t.assigneeId = :assigneeId', { assigneeId: query.assigneeId });
        if (query.search) {
            qb.andWhere('t.title ILIKE :search', { search: `%${query.search}%` });
        }

        qb.orderBy('t.createdAt', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);

        const [data, total] = await qb.getManyAndCount();
        return { data, total, page, pageSize };
    }

    async findById(workspaceId: string, projectId: string, id: string): Promise<Task> {
        return this.assertTaskInWorkspace(workspaceId, projectId, id);
    }

    async update(
        workspaceId: string,
        projectId: string,
        id: string,
        dto: UpdateTaskDto,
        actorId: string,
    ): Promise<Task> {
        const task = await this.findById(workspaceId, projectId, id);

        // ── permission check ──
        const actorMembership = await this.memberRepo.findOne({
            where: { workspaceId, userId: actorId },
        });
        const isAdminOrOwner =
            actorMembership?.role === 'ADMIN' ||
            actorMembership?.role === 'OWNER';
        const isCreator = task.createdById === actorId;
        const isPrivileged = isAdminOrOwner || isCreator;

        // Status change — all allowed
        const wantsMoreThanStatus =
            dto.title !== undefined ||
            dto.description !== undefined ||
            dto.priority !== undefined ||
            dto.dueAt !== undefined ||
            dto.assigneeId !== undefined ||
            dto.parentTaskId !== undefined;

        if (wantsMoreThanStatus && !isPrivileged) {
            throw new ForbiddenException(
                'Only task creator or admin can edit task details',
            );
        }

        // Capture previous values BEFORE mutation so we can compare
        const prevStatus = task.status;
        const prevAssigneeId = task.assigneeId;

        if (dto.assigneeId !== undefined) {
            if (dto.assigneeId !== null) {
                const member = await this.memberRepo.findOne({
                    where: { workspaceId, userId: dto.assigneeId },
                });
                if (!member) {
                    throw new BadRequestException('Assignee must be a workspace member');
                }
            }
            task.assigneeId = dto.assigneeId ?? null;
        }

        if (dto.parentTaskId !== undefined) {
            if (dto.parentTaskId === null) {
                task.parentTaskId = null;
            } else {
                if (dto.parentTaskId === id) {
                    throw new BadRequestException('A task cannot be its own parent');
                }
                const parent = await this.taskRepo.findOne({
                    where: { id: dto.parentTaskId, projectId },
                });
                if (!parent) {
                    throw new BadRequestException('Parent task not found in this project');
                }
                // Prevent cycles: the new parent cannot be a descendant of this task.
                if (await this.isAncestor(id, dto.parentTaskId)) {
                    throw new BadRequestException('Cannot move a task under its own descendant');
                }
                const parentDepth = await this.getDepth(dto.parentTaskId);
                if (parentDepth >= MAX_SUBTASK_DEPTH) {
                    throw new BadRequestException(
                        `Subtasks cannot be nested deeper than ${MAX_SUBTASK_DEPTH} levels`,
                    );
                }
                task.parentTaskId = dto.parentTaskId;
            }
        }

        if (dto.title !== undefined) task.title = dto.title;
        if (dto.description !== undefined) task.description = dto.description ?? null;
        if (dto.priority !== undefined) task.priority = dto.priority;
        if (dto.dueAt !== undefined) {
            task.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
        }
        if (dto.status !== undefined) {
            task.status = dto.status;
            // Auto-stamp completion time when status flips to DONE
            task.completedAt = dto.status === TaskStatus.DONE ? new Date() : null;
        }

        const saved = await this.taskRepo.save(task);

        // ── activity ──
        const events: Array<{ type: ActivityType; payload: Record<string, any> }> = [];

        if (dto.status !== undefined && dto.status !== prevStatus) {
            events.push({
                type: ActivityType.TASK_STATUS_CHANGED,
                payload: { from: prevStatus, to: dto.status },
            });
            if (dto.status === TaskStatus.DONE) {
                events.push({ type: ActivityType.TASK_COMPLETED, payload: {} });
            }
        }
        if (dto.assigneeId !== undefined && dto.assigneeId !== prevAssigneeId) {
            // Names resolved for UI readable text
            const [fromUser, toUser] = await Promise.all([
                prevAssigneeId
                    ? this.userRepo.findOne({ where: { id: prevAssigneeId } })
                    : null,
                dto.assigneeId
                    ? this.userRepo.findOne({ where: { id: dto.assigneeId } })
                    : null,
            ]);

            events.push({
                type: ActivityType.TASK_ASSIGNED,
                payload: {
                    from: prevAssigneeId,
                    to: dto.assigneeId,
                    fromName: fromUser?.name ?? null,
                    toName: toUser?.name ?? null,
                },
            });
        }

        if (
            events.length === 0 &&
            (dto.title !== undefined ||
                dto.description !== undefined ||
                dto.priority !== undefined ||
                dto.dueAt !== undefined ||
                dto.parentTaskId !== undefined)
        ) {
            events.push({ type: ActivityType.TASK_UPDATED, payload: {} });
        }

        for (const e of events) {
            await this.activities.record({
                workspaceId,
                actorId,
                type: e.type,
                entityType: ActivityEntityType.TASK,
                entityId: saved.id,
                payload: {
                    ...e.payload,
                    taskTitle: saved.title,
                },
            });
        }

        if (
            dto.assigneeId !== undefined &&
            dto.assigneeId !== null &&
            dto.assigneeId !== prevAssigneeId &&
            dto.assigneeId !== actorId   // don't notify yourself
        ) {
            const assignedPayload: TaskAssignedPayload = {
                taskId: saved.id,
                taskTitle: saved.title,
                projectId: saved.projectId,
                workspaceId,
                assigneeId: dto.assigneeId,
                assignedById: actorId,
            };
            await this.notificationsQueue.add('task_assigned', assignedPayload);
        }

        // Status changed — notify the assignee (if any, and not the actor themselves)
        if (
            dto.status !== undefined &&
            dto.status !== prevStatus &&
            saved.assigneeId &&
            saved.assigneeId !== actorId
        ) {
            const statusPayload: StatusChangedPayload = {
                taskId: saved.id,
                taskTitle: saved.title,
                projectId: saved.projectId,
                workspaceId,
                assigneeId: saved.assigneeId,
                oldStatus: prevStatus,
                newStatus: dto.status,
                changedById: actorId,
            };
            await this.notificationsQueue.add('status_changed', statusPayload);
        }

        return saved;

    }

    async remove(
        workspaceId: string,
        projectId: string,
        id: string,
        actorId: string,
    ): Promise<void> {
        const task = await this.findById(workspaceId, projectId, id);

        // ── permission check ──
        const actorMembership = await this.memberRepo.findOne({
            where: { workspaceId, userId: actorId },
        });
        const isAdminOrOwner =
            actorMembership?.role === 'ADMIN' ||
            actorMembership?.role === 'OWNER';
        const isCreator = task.createdById === actorId;

        if (!isAdminOrOwner && !isCreator) {
            throw new ForbiddenException(
                'Only task creator or admin can delete this task',
            );
        }

        // Capture title before remove() wipes the entity
        const title = task.title;
        const pid = task.projectId;

        await this.taskRepo.remove(task);

        await this.activities.record({
            workspaceId,
            actorId,
            type: ActivityType.TASK_DELETED,
            entityType: ActivityEntityType.TASK,
            entityId: id,          // use captured id — task.id is gone after remove()
            payload: { title, projectId: pid },
        });
    }


    // Returns the depth of `taskId` (root = 0). Throws if path > MAX.
    private async getDepth(taskId: string): Promise<number> {
        const result = await this.taskRepo.query(
            `
            WITH RECURSIVE ancestors AS (
                SELECT id, "parentTaskId", 0 AS depth
                FROM tasks WHERE id = $1
                UNION ALL
                SELECT t.id, t."parentTaskId", a.depth + 1
                FROM tasks t
                INNER JOIN ancestors a ON t.id = a."parentTaskId"
                WHERE a.depth < $2
            )
            SELECT MAX(depth) AS depth FROM ancestors;
            `,
            [taskId, MAX_SUBTASK_DEPTH + 5],
        );
        return Number(result[0]?.depth ?? 0);
    }

    // Returns true if `candidateAncestorId` is an ancestor (or self) of `taskId`.
    private async isAncestor(
        candidateAncestorId: string,
        taskId: string,
    ): Promise<boolean> {
        const result = await this.taskRepo.query(
            `
            WITH RECURSIVE ancestors AS (
                SELECT id, "parentTaskId"
                FROM tasks WHERE id = $1
                UNION ALL
                SELECT t.id, t."parentTaskId"
                FROM tasks t
                INNER JOIN ancestors a ON t.id = a."parentTaskId"
            )
            SELECT 1 FROM ancestors WHERE id = $2 LIMIT 1;
            `,
            [taskId, candidateAncestorId],
        );
        return result.length > 0;
    }

    // Fetch the full subtree rooted at `taskId` as a flat list of tasks with depth.
    async getSubtree(
        workspaceId: string,
        projectId: string,
        taskId: string,
    ): Promise<Array<Task & { depth: number }>> {
        // Confirm the root exists in this project
        await this.findById(workspaceId, projectId, taskId);

        const result = await this.taskRepo.query(
            `
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
            `,
            [taskId, MAX_SUBTASK_DEPTH + 1],
        );
        return result;
    }

    async assertTaskInWorkspace(
        workspaceId: string,
        projectId: string,
        taskId: string,
    ): Promise<Task> {
        const task = await this.taskRepo
            .createQueryBuilder('t')
            .innerJoin('projects', 'p', 'p.id = t."projectId"')
            .where('t.id = :taskId', { taskId })
            .andWhere('t.projectId = :projectId', { projectId })
            .andWhere('p."workspaceId" = :workspaceId', { workspaceId })
            .getOne();

        if (!task) throw new NotFoundException('Task not found');
        return task;
    }
}