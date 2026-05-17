import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { User } from '../users/user.entity';
import { WorkspaceMember } from '../workspaces/workspace-member.entity';
import { Comment } from './comment.entity';
import { Task } from '../tasks/task.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ActivitiesService } from '../activities/activities.service';
import { TasksService } from '../tasks/tasks.service';
import { ActivityType, ActivityEntityType } from '../activities/activity-type.enum';
import { QUEUE_NOTIFICATIONS } from '../queues/queues.constants';
import { type CommentMentionPayload } from '../queues/job-payloads';

@Injectable()
export class CommentsService {
    constructor(
        @InjectRepository(Comment)
        private readonly commentRepo: Repository<Comment>,
        @InjectRepository(Task)
        private readonly taskRepo: Repository<Task>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(WorkspaceMember)
        private readonly memberRepo: Repository<WorkspaceMember>,
        private readonly activities: ActivitiesService,
        private readonly tasks: TasksService,
        @InjectQueue(QUEUE_NOTIFICATIONS)
        private readonly notificationsQueue: Queue,
    ) { }

    async create(
        workspaceId: string,
        projectId: string,
        taskId: string,
        dto: CreateCommentDto,
        authorId: string,
    ): Promise<Comment> {
        // ── scoped check: task must belong to this workspace+project ──
        const task = await this.tasks.assertTaskInWorkspace(workspaceId, projectId, taskId);

        if (dto.parentCommentId) {
            const parent = await this.commentRepo.findOne({
                where: { id: dto.parentCommentId, taskId },
            });
            if (!parent) {
                throw new BadRequestException('Parent comment not found on this task');
            }
            // Disallow replies-to-replies: keep it one level deep
            if (parent.parentCommentId) {
                throw new BadRequestException('Cannot reply to a reply');
            }
        }

        const comment = this.commentRepo.create({
            taskId,
            authorId,
            body: dto.body,
            parentCommentId: dto.parentCommentId ?? null,
        });
        const saved = await this.commentRepo.save(comment);

        // ── activity ──
        await this.activities.record({
            workspaceId,
            actorId: authorId,
            type: ActivityType.COMMENT_ADDED,
            entityType: ActivityEntityType.COMMENT,
            entityId: saved.id,
            payload: { taskId, parentCommentId: saved.parentCommentId },
        });

        // ── notifications for mentioned users ──
        const mentionedEmails = this.extractMentionedEmails(dto.body);

        // Get author's name once (for notification body)
        const author = await this.userRepo.findOne({ where: { id: authorId } });

        for (const email of mentionedEmails) {
            // Email se user dhundh
            const user = await this.userRepo.findOne({ where: { email } });
            if (!user) continue;                      // unknown email
            if (user.id === authorId) continue;       // self-mention

            // Workspace member confirm kar (security: cross-workspace leak prevent kar)
            const member = await this.memberRepo.findOne({
                where: { workspaceId, userId: user.id },
            });
            if (!member) continue;

            const payload: CommentMentionPayload = {
                commentId: saved.id,
                taskId,
                taskTitle: task.title,
                workspaceId,                          // ← parameter se, task.workspaceId nahi
                mentionedUserId: user.id,
                mentionedUserName: user.name,         // ← naya field
                authorId,
                authorName: author?.name ?? 'Someone', // ← naya field
                excerpt: dto.body.slice(0, 120),
            };

            await this.notificationsQueue.add('comment_mention', payload);
        }

        return saved;
    }

    async listForTask(
        workspaceId: string,
        projectId: string,
        taskId: string
    ): Promise<Comment[]> {
        await this.tasks.assertTaskInWorkspace(workspaceId, projectId, taskId);
        return this.commentRepo.find({
            where: { taskId },
            relations: ['author'],
            order: { createdAt: 'ASC' },
        });
    }

    async update(
        workspaceId: string,
        projectId: string,
        taskId: string,
        id: string,
        dto: UpdateCommentDto,
        actorId: string,
    ): Promise<Comment> {
        await this.tasks.assertTaskInWorkspace(workspaceId, projectId, taskId);

        const comment = await this.commentRepo.findOne({ where: { id, taskId } });
        if (!comment) throw new NotFoundException('Comment not found');
        if (comment.authorId !== actorId) {
            throw new ForbiddenException('Only the author can edit this comment');
        }
        comment.body = dto.body;
        return this.commentRepo.save(comment);
    }

    async remove(
        workspaceId: string,
        projectId: string,
        taskId: string,
        id: string,
        actorId: string
    ): Promise<void> {
        await this.tasks.assertTaskInWorkspace(workspaceId, projectId, taskId);

        const comment = await this.commentRepo.findOne({ where: { id, taskId } });
        if (!comment) throw new NotFoundException('Comment not found');
        if (comment.authorId !== actorId) {
            throw new ForbiddenException('Only the author can delete this comment');
        }
        await this.commentRepo.remove(comment);
    }

    /**
    * Extracts emails from @email patterns in a comment body.
    * Example: "Hey @alice@example.com, please review"
    */
    private extractMentionedEmails(body: string): string[] {
        const emailPattern = /\B@([\w.+-]+@[\w-]+\.[\w.-]+)/gi;
        const matches = [...body.matchAll(emailPattern)];
        return [...new Set(matches.map((m) => m[1]))];
    }
}