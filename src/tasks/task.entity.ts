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
import { Project } from '../projects/project.entity';
import { User } from '../users/user.entity';
import { TaskStatus } from './task-status.enum';
import { TaskPriority } from './task-priority.enum';

@Entity('tasks')
// Composite index for the most common query: tasks in a project, by status.
@Index('IDX_tasks_project_status', ['projectId', 'status'])
// Composite for "my open tasks": filter by assignee + non-terminal statuses
@Index('IDX_tasks_assignee_status', ['assigneeId', 'status'])
// For the reminder scheduler in Part 3 — "tasks due within X hours".
@Index('IDX_tasks_dueAt', ['dueAt'])
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  projectId!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project!: Project;

  // Nullable FK to support subtasks (set in Phase 14)
  @Index()
  @Column({ type: 'uuid', nullable: true })
  parentTaskId!: string | null;

  @ManyToOne(() => Task, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'parentTaskId' })
  parentTask!: Task | null;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.TODO,
  })
  status!: TaskStatus;

  @Column({
    type: 'enum',
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
  })
  priority!: TaskPriority;

  @Column({ type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  assigneeId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigneeId' })
  assignee!: User | null;

  @Column({ type: 'uuid' })
  createdById!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'createdById' })
  createdBy!: User;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}