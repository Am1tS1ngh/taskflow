import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Task } from './task.entity';
import { Project } from '../projects/project.entity';
import { WorkspaceMember } from '../workspaces/workspace-member.entity';
import { User } from '../users/user.entity';
import { ActivitiesService } from '../activities/activities.service';
import { getQueueToken } from '@nestjs/bullmq';
import { QUEUE_NOTIFICATIONS } from '../queues/queues.constants';
import { NotFoundException, BadRequestException } from '@nestjs/common';

const mockTaskRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
  query: jest.fn(),
};

const mockProjectRepo = { findOne: jest.fn() };
const mockMemberRepo = { findOne: jest.fn() };
const mockUserRepo = { findOne: jest.fn() };
const mockActivities = { record: jest.fn().mockResolvedValue({}) };
const mockQueue = { add: jest.fn().mockResolvedValue({}) };

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getRepositoryToken(Task), useValue: mockTaskRepo },
        { provide: getRepositoryToken(Project), useValue: mockProjectRepo },
        { provide: getRepositoryToken(WorkspaceMember), useValue: mockMemberRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: ActivitiesService, useValue: mockActivities },
        { provide: getQueueToken(QUEUE_NOTIFICATIONS), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw NotFoundException if project not found', async () => {
    mockProjectRepo.findOne.mockResolvedValue(null);

    await expect(
      service.create('ws-1', 'proj-1', { title: 'Test' } as any, 'user-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException if assignee not a member', async () => {
    mockProjectRepo.findOne.mockResolvedValue({ id: 'proj-1' });
    mockMemberRepo.findOne.mockResolvedValue(null);

    await expect(
      service.create('ws-1', 'proj-1', { title: 'Test', assigneeId: 'user-2' } as any, 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should create a task successfully', async () => {
    const mockTask = { id: 'task-1', title: 'Test Task', projectId: 'proj-1', assigneeId: null };
    mockProjectRepo.findOne.mockResolvedValue({ id: 'proj-1' });
    mockTaskRepo.create.mockReturnValue(mockTask);
    mockTaskRepo.save.mockResolvedValue(mockTask);

    const result = await service.create(
      'ws-1', 'proj-1',
      { title: 'Test Task', priority: 'MEDIUM' } as any,
      'user-1',
    );

    expect(result.title).toBe('Test Task');
    expect(mockActivities.record).toHaveBeenCalled();
  });
});