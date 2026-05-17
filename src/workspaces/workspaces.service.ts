import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { Workspace } from './workspace.entity';
import { WorkspaceMember } from './workspace-member.entity';
import { WorkspaceRole } from './workspace-role.enum';
import { User } from '../users/user.entity';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { ActivitiesService } from '../activities/activities.service';
import { ActivityType, ActivityEntityType } from '../activities/activity-type.enum';
import { QUEUE_NOTIFICATIONS } from '../queues/queues.constants';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
    @InjectQueue(QUEUE_NOTIFICATIONS)
    private readonly notificationsQueue: Queue,
  ) { }

  async create(dto: CreateWorkspaceDto, creatorId: string): Promise<Workspace> {
    return this.dataSource.transaction(async (manager) => {
      const workspace = manager.create(Workspace, {
        name: dto.name,
        description: dto.description ?? null,
        ownerId: creatorId,
      });
      const saved = await manager.save(workspace);

      const ownerMembership = manager.create(WorkspaceMember, {
        workspaceId: saved.id,
        userId: creatorId,
        role: WorkspaceRole.OWNER,
      });
      await manager.save(ownerMembership);

      return saved;
    });
  }

  async listForUser(userId: string): Promise<Workspace[]> {
    return this.workspaceRepo
      .createQueryBuilder('w')
      .innerJoin('workspace_members', 'm', 'm."workspaceId" = w.id')
      .where('m."userId" = :userId', { userId })
      .orderBy('w.createdAt', 'DESC')
      .getMany();
  }

  async findById(workspaceId: string): Promise<Workspace> {
    const ws = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
    if (!ws) throw new NotFoundException('Workspace not found');
    return ws;
  }

  async getMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember | null> {
    return this.memberRepo.findOne({ where: { workspaceId, userId } });
  }

  async addMember(
    workspaceId: string,
    dto: AddMemberDto,
    actorId: string,
  ): Promise<WorkspaceMember> {
    await this.assertCanManageMembers(workspaceId, actorId);

    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) throw new NotFoundException('User with that email not found');

    const existing = await this.memberRepo.findOne({
      where: { workspaceId, userId: user.id },
    });
    if (existing) throw new ConflictException('User is already a member');

    const membership = this.memberRepo.create({
      workspaceId,
      userId: user.id,
      role: dto.role ?? WorkspaceRole.MEMBER,
    });

    if (membership.role === WorkspaceRole.OWNER) {
      throw new BadRequestException('Use transfer-ownership to set a new owner');
    }

    const saved = await this.memberRepo.save(membership);

    // ── activity ──
    await this.activitiesService.record({
      workspaceId,
      actorId,
      type: ActivityType.MEMBER_ADDED,
      entityType: ActivityEntityType.WORKSPACE_MEMBER,
      entityId: saved.id,
      payload: {
        memberId: user.id,
        memberName: user.name,
        memberEmail: user.email,
        role: saved.role,
      },
    });

    // ── notification ──
    await this.notificationsQueue.add('member_added', {
      workspaceId,
      userId: user.id,
      addedById: actorId,
    });

    return saved;
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return this.memberRepo.find({
      where: { workspaceId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  async updateMemberRole(
    workspaceId: string,
    memberId: string,
    role: WorkspaceRole,
    actorId: string,
  ): Promise<WorkspaceMember> {
    await this.assertCanManageMembers(workspaceId, actorId);

    if (role === WorkspaceRole.OWNER) {
      throw new BadRequestException('Use transfer-ownership to set OWNER');
    }

    const member = await this.memberRepo.findOne({
      where: { id: memberId, workspaceId },
      relations: ['user'],
    });
    if (!member) throw new NotFoundException('Member not found');
    if (member.role === WorkspaceRole.OWNER) {
      throw new BadRequestException('Cannot change OWNER role here');
    }

    const prevRole = member.role;
    member.role = role;
    const saved = await this.memberRepo.save(member);

    // ── activity ──
    await this.activitiesService.record({
      workspaceId,
      actorId,
      type: ActivityType.MEMBER_ROLE_CHANGED,
      entityType: ActivityEntityType.WORKSPACE_MEMBER,
      entityId: saved.id,
      payload: {
        memberId: member.userId,
        memberName: member.user?.name,
        prevRole,
        newRole: role,
      },
    });

    await this.notificationsQueue.add('member_role_changed', {
      workspaceId,
      userId: member.userId,   // recipient
      changedById: actorId,
      prevRole,
      newRole: role,
    });

    return saved;
  }

  async removeMember(
    workspaceId: string,
    memberId: string,
    actorId: string,
  ): Promise<void> {
    await this.assertCanManageMembers(workspaceId, actorId);

    const member = await this.memberRepo.findOne({
      where: { id: memberId, workspaceId },
      relations: ['user'],
    });
    if (!member) throw new NotFoundException('Member not found');
    if (member.role === WorkspaceRole.OWNER) {
      throw new BadRequestException('Cannot remove the OWNER');
    }

    const removedUserId = member.userId;
    const removedUserName = member.user?.name;

    await this.memberRepo.remove(member);

    // ── activity ──
    await this.activitiesService.record({
      workspaceId,
      actorId,
      type: ActivityType.MEMBER_REMOVED,
      entityType: ActivityEntityType.WORKSPACE_MEMBER,
      entityId: memberId,
      payload: {
        memberId: removedUserId,
        memberName: removedUserName,
      },
    });
  }

  private async assertCanManageMembers(
    workspaceId: string,
    actorId: string,
  ): Promise<void> {
    const m = await this.getMembership(workspaceId, actorId);
    if (!m) throw new ForbiddenException('Not a member of this workspace');
    if (m.role !== WorkspaceRole.OWNER && m.role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException('Only OWNER or ADMIN can manage members');
    }
  }
}