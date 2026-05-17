import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { type NotificationJobName } from '../queues/job-payloads';

@Entity('notifications')
@Index('IDX_notifications_userId_createdAt', ['userId', 'createdAt'])
export class Notification {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid' })
    userId!: string;

    @Column({ type: 'varchar', length: 50 })
    type!: NotificationJobName;

    @Column({ type: 'varchar', length: 200 })      
    title!: string;                                  

    @Column({ type: 'text', nullable: true })
    body!: string | null;

    @Column({ type: 'jsonb' })
    payload!: Record<string, unknown>;

    @Column({ default: false })
    read!: boolean;

    @CreateDateColumn()
    createdAt!: Date;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user!: User;
}