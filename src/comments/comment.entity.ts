import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import { Task } from '../tasks/task.entity';
import { User } from '../users/user.entity';

@Entity('comments')
@Index('IDX_comments_task_created', ['taskId', 'createdAt'])
export class Comment {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Index()
    @Column({ type: 'uuid' })
    taskId!: string;

    @ManyToOne(() => Task, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'taskId' })
    task!: Task;

    @Index()
    @Column({ type: 'uuid', nullable: true })
    parentCommentId!: string | null;

    @ManyToOne(() => Comment, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'parentCommentId' })
    parentComment!: Comment | null;

    @Column({ type: 'uuid' })
    authorId!: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'authorId' })
    author!: User;

    @Column({ type: 'text' })
    body!: string;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt!: Date;
}