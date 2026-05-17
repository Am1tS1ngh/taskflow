import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ActivitiesService } from '../activities/activities.service';
import { ActivityType, ActivityEntityType } from '../activities/activity-type.enum';

@Injectable()
export class ProjectsService {
    constructor(
        @InjectRepository(Project)
        private readonly projectRepo: Repository<Project>,
        private readonly activities: ActivitiesService,
    ) { }

    async create(
        workspaceId: string,
        dto: CreateProjectDto,
        createdById: string,
    ): Promise<Project> {
        const project = this.projectRepo.create({
            workspaceId,
            name: dto.name,
            description: dto.description ?? null,
            createdById,
        });

        const saved = await this.projectRepo.save(project);

        // ── activity ──
        await this.activities.record({
            workspaceId,
            actorId: createdById,
            type: ActivityType.PROJECT_CREATED,
            entityType: ActivityEntityType.PROJECT,
            entityId: saved.id,
            payload: { name: saved.name },
        });

        return saved;
    }

    async listInWorkspace(workspaceId: string): Promise<Project[]> {
        return this.projectRepo.find({
            where: { workspaceId },
            order: { createdAt: 'DESC' },
        });
    }

    async findById(workspaceId: string, id: string): Promise<Project> {
        const project = await this.projectRepo.findOne({
            where: { id, workspaceId },
        });
        if (!project) {
            throw new NotFoundException('Project not found');
        }
        return project;
    }

    async update(
        workspaceId: string,
        id: string,
        dto: UpdateProjectDto,
        actorId: string,
    ): Promise<Project> {
        const project = await this.findById(workspaceId, id);
        Object.assign(project, dto);
        const saved = await this.projectRepo.save(project);

        // ── activity ──
        await this.activities.record({
            workspaceId,
            actorId,
            type: ActivityType.PROJECT_UPDATED,
            entityType: ActivityEntityType.PROJECT,
            entityId: saved.id,
            payload: { name: saved.name, changes: dto },
        });

        return saved;
    }

    async remove(workspaceId: string, id: string): Promise<void> {
        const project = await this.findById(workspaceId, id);
        await this.projectRepo.remove(project);
    }
}
