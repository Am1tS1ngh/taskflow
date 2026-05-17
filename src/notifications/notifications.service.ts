import {
    Injectable,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';
import { type NotificationJobName } from '../queues/job-payloads';

interface CreateNotificationDto {
    userId: string;
    type: NotificationJobName;
    title: string;
    body?: string | null;
    payload: Record<string, unknown>;
}

export interface PaginatedNotifications {
    data: Notification[];
    total: number;
    page: number;
    limit: number;
}

@Injectable()
export class NotificationsService {
    constructor(
        @InjectRepository(Notification)
        private readonly notificationsRepository: Repository<Notification>,
    ) { }

    /** Called by the NotificationsProcessor after consuming a queue job. */
    async create(dto: CreateNotificationDto): Promise<Notification> {
        const notification = this.notificationsRepository.create(dto);
        return this.notificationsRepository.save(notification);
    }

    /**
     * List notifications for the authenticated user.
     * Scoped strictly by userId — a user can NEVER see another user's notifications.
     */
    async findAllForUser(
        userId: string,
        page: number,
        limit: number,
        onlyUnread?: boolean,
    ): Promise<PaginatedNotifications> {
        const qb = this.notificationsRepository
            .createQueryBuilder('n')
            .where('n."userId" = :userId', { userId })
            .orderBy('n."createdAt"', 'DESC');

        if (onlyUnread) {
            qb.andWhere('n.read = false');
        }

        const [data, total] = await qb
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();

        return { data, total, page, limit };
    }

    /**
     * Mark one notification as read.
     * userId scoping: throws 403 if the notification belongs to a different user.
     */
    async markAsRead(id: string, userId: string): Promise<Notification> {
        const notification = await this.notificationsRepository.findOne({
            where: { id },
        });

        if (!notification) {
            throw new NotFoundException('Notification not found');
        }

        // Scope check: the requesting user must own this notification.
        if (notification.userId !== userId) {
            throw new ForbiddenException('Cannot mark another user\'s notification as read');
        }

        notification.read = true;
        return this.notificationsRepository.save(notification);
    }

    /** Mark all of the authenticated user's notifications as read. */
    async markAllAsRead(userId: string): Promise<{ updated: number }> {
        const result = await this.notificationsRepository
            .createQueryBuilder()
            .update(Notification)
            .set({ read: true })
            .where('"userId" = :userId AND read = false', { userId })
            .execute();

        return { updated: result.affected ?? 0 };
    }
}