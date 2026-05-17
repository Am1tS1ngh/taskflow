// src/notifications/notifications.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NOTIFICATIONS } from '../queues/queues.constants';
import { NotificationsService } from './notifications.service';
import { TaskflowGateway } from '../gateway/taskflow.gateway';
import {
    type NotificationJobName,
    type TaskAssignedPayload,
    type DueReminderPayload,
    type CommentMentionPayload,
    type StatusChangedPayload,
    type MemberAddedPayload,
    type MemberRoleChangedPayload,
} from '../queues/job-payloads';

/** Extract the recipient userId from whichever payload type we receive. */
function recipientUserId(
    name: NotificationJobName,
    data: TaskAssignedPayload | DueReminderPayload | CommentMentionPayload | StatusChangedPayload | MemberAddedPayload | MemberRoleChangedPayload,
): string | null {
    switch (name) {
        case 'task_assigned':
            return (data as TaskAssignedPayload).assigneeId;
        case 'due_reminder':
            return (data as DueReminderPayload).assigneeId;
        case 'comment_mention':
            return (data as CommentMentionPayload).mentionedUserId;
        case 'status_changed':
            return (data as StatusChangedPayload).assigneeId;
        case 'member_added':
            return (data as MemberAddedPayload).userId;
        case 'member_role_changed':
            return (data as MemberRoleChangedPayload).userId;
        default:
            return null;
    }
}

@Processor(QUEUE_NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
    private readonly logger = new Logger(NotificationsProcessor.name);

    constructor(
        private readonly notificationsService: NotificationsService,
        private readonly gateway: TaskflowGateway,
    ) {
        super();
    }

    async process(job: Job): Promise<void> {
        const name = job.name as NotificationJobName;
        const data = job.data as
            | TaskAssignedPayload
            | DueReminderPayload
            | CommentMentionPayload
            | StatusChangedPayload
            | MemberAddedPayload
            | MemberRoleChangedPayload;

        const userId = recipientUserId(name, data);

        if (!userId) {
            this.logger.warn(
                `Job "${name}" (id=${job.id}) has no recipient userId — skipping`,
            );
            return;
        }

        let title: string;
        let body: string | null;

        switch (name) {
            case 'task_assigned': {
                const d = data as TaskAssignedPayload;
                title = 'New task assigned';
                body = `"${d.taskTitle}" was assigned to you`;
                break;
            }
            case 'due_reminder': {
                const d = data as DueReminderPayload;
                title = 'Task due soon';
                body = `"${d.taskTitle}" is due soon`;
                break;
            }
            case 'comment_mention': {
                const d = data as CommentMentionPayload;
                title = `${d.authorName} mentioned you`;
                body = d.excerpt;
                break;
            }
            case 'status_changed': {
                const d = data as StatusChangedPayload;
                title = 'Task status updated';
                body = `"${d.taskTitle}" moved from ${d.oldStatus} to ${d.newStatus}`;
                break;
            }
            case 'member_added': {
                title = 'You were added to a workspace';
                body = 'You are now a member. Start collaborating!';
                break;
            }
            case 'member_role_changed': {
                const d = data as MemberRoleChangedPayload;
                title = 'Your role was updated';
                body = `Your role was changed from ${d.prevRole} to ${d.newRole}`;
                break;
            }
            default:
                title = 'Notification';
                body = null;
        }

        const notification = await this.notificationsService.create({
            userId,
            type: name,
            title,
            body,
            payload: data as unknown as Record<string, unknown>,
        });

        this.logger.log(
            `Notification persisted: type=${notification.type} userId=${userId} id=${notification.id}`,
        );

        // Push real-time event to all of this user's connected WebSocket clients.
        // If the user has no open connections, this is a no-op (no error).
        this.gateway.emitToUser(userId, 'notification', notification);
    }
}