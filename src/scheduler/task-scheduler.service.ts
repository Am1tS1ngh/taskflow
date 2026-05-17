import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Task } from '../tasks/task.entity';
import { TaskStatus } from '../tasks/task-status.enum';
import { QUEUE_NOTIFICATIONS } from '../queues/queues.constants';
import { type DueReminderPayload } from '../queues/job-payloads';

@Injectable()
export class TaskSchedulerService {
    private readonly logger = new Logger(TaskSchedulerService.name);

    constructor(
        @InjectRepository(Task)
        private readonly tasksRepository: Repository<Task>,

        @InjectQueue(QUEUE_NOTIFICATIONS)
        private readonly notificationsQueue: Queue,
    ) { }

    /**
     * Runs every 5 minutes. Scans for tasks due in the next 60 minutes
     * that have an assignee and are not yet complete.
     *
     * Uses the IDX_tasks_dueAt index added in Part 2 Phase 17.
     *
     * Deduplication: jobId `due_reminder:{taskId}:{hourWindow}` ensures
     * we never queue two reminders for the same task within the same hour.
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
    async scanDueSoonTasks(): Promise<void> {
        const now = new Date();
        const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);

        this.logger.debug(
            `Scanning for tasks due between ${now.toISOString()} and ${inOneHour.toISOString()}`,
        );

        const tasks = await this.tasksRepository.find({
            where: {
                dueAt: Between(now, inOneHour),
                status: Not(In([TaskStatus.DONE, TaskStatus.CANCELLED])),
            },
            relations: ['project'],
        });

        // Filter to only tasks that have an assignee
        const assignedTasks = tasks.filter((t) => t.assigneeId != null);

        this.logger.debug(`Found ${assignedTasks.length} due-soon task(s) with assignees`);

        // Current hour window key — used for job deduplication.
        // Format: YYYY-MM-DDTHH (e.g. "2024-01-15T14")
        const hourWindow = now.toISOString().slice(0, 13);

        for (const task of assignedTasks) {
            const payload: DueReminderPayload = {
                taskId: task.id,
                taskTitle: task.title,
                projectId: task.project?.id ?? task.projectId,
                workspaceId: task.project.workspaceId,
                assigneeId: task.assigneeId!,
                dueAt: task.dueAt!.toISOString(),
            };

            await this.notificationsQueue.add('due_reminder', payload, {
                // If a job with this ID already exists in the queue (waiting or delayed),
                // BullMQ silently ignores the duplicate add(). This prevents sending
                // multiple reminders per task per hour even if the cron fires multiple times.
                jobId: `due_reminder:${task.id}:${hourWindow}`,
            });

            this.logger.debug(
                `Queued due_reminder for task "${task.title}" (id=${task.id})`,
            );
        }
    }
}