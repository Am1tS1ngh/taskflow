import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Workspace } from '../workspaces/workspace.entity';
import { User } from '../users/user.entity';
import { ActivityType, ActivityEntityType } from './activity-type.enum';

@Entity('activities')
@Index('IDX_activities_workspace_created', ['workspaceId', 'createdAt'])
@Index('IDX_activities_entity', ['entityType', 'entityId'])
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace!: Workspace;

  @Column({ type: 'uuid' })
  actorId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actorId' })
  actor!: User;

  @Column({ type: 'varchar', length: 64 })
  type!: ActivityType;

  @Column({ type: 'varchar', length: 32 })
  entityType!: ActivityEntityType;

  @Column({ type: 'uuid' })
  entityId!: string;

  @Column({ type: 'jsonb', default: {} })
  payload!: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}