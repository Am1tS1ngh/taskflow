import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Activity } from './activity.entity';
import { ActivityType, ActivityEntityType } from './activity-type.enum';

export interface RecordActivityParams {
    workspaceId: string;
    actorId: string;
    type: ActivityType;
    entityType: ActivityEntityType;
    entityId: string;
    payload?: Record<string, any>;
}

@Injectable()
export class ActivitiesService {
    constructor(
        @InjectRepository(Activity)
        private readonly activityRepo: Repository<Activity>,
    ) { }

    async record(params: RecordActivityParams): Promise<Activity> {
        const activity = this.activityRepo.create({
            workspaceId: params.workspaceId,
            actorId: params.actorId,
            type: params.type,
            entityType: params.entityType,
            entityId: params.entityId,
            payload: params.payload ?? {},
        });
        return this.activityRepo.save(activity);
    }

     formatMessage(activity: Activity): string {
        const actor = activity.actor?.name ?? 'Someone';
        const p = activity.payload;

        switch (activity.type) {
            case ActivityType.PROJECT_CREATED:
                return `${actor} created project "${p.name}"`;
            case ActivityType.PROJECT_UPDATED:
                return `${actor} updated project "${p.name}"`;
            case ActivityType.TASK_CREATED:
                return `${actor} created task "${p.title}"`;
            case ActivityType.TASK_UPDATED:
                return `${actor} updated task "${p.taskTitle}"`;
            case ActivityType.TASK_STATUS_CHANGED:
                return `${actor} changed status from "${p.from}" to "${p.to}"`;
            case ActivityType.TASK_ASSIGNED:
                return p.to
                    ? `${actor} assigned task to ${p.toName ?? p.to}`
                    : `${actor} unassigned the task`;
            case ActivityType.TASK_COMPLETED:
                return `${actor} completed "${p.taskTitle}"`;
            case ActivityType.TASK_DELETED:
                return `${actor} deleted task "${p.title}"`;
            case ActivityType.COMMENT_ADDED:
                return `${actor} commented on "${p.taskTitle}"`;
            case ActivityType.MEMBER_ADDED:
                return `${actor} added ${p.memberName} to the workspace`;
            case ActivityType.MEMBER_REMOVED:
                return `${actor} removed ${p.memberName} from the workspace`;
            case ActivityType.MEMBER_ROLE_CHANGED:
                return `${actor} changed ${p.memberName}'s role from ${p.prevRole} to ${p.newRole}`;
            default:
                return `${actor} performed an action`;
        }
    }

    async listForWorkspace(
        workspaceId: string,
        page = 1,
        pageSize = 50,
    ): Promise<{ data: Activity[]; total: number; page: number; pageSize: number }> {
        const [data, total] = await this.activityRepo.findAndCount({
            where: { workspaceId },
            relations: ['actor'],
            order: { createdAt: 'DESC' },
            skip: (page - 1) * pageSize,
            take: Math.min(pageSize, 100),
        });
        return { data, total, page, pageSize };
    }

    async listForEntity(
        entityType: ActivityEntityType,
        entityId: string,
    ): Promise<Activity[]> {
        return this.activityRepo.find({
            where: { entityType, entityId },
            relations: ['actor'],
            order: { createdAt: 'DESC' },
        });
    }
}