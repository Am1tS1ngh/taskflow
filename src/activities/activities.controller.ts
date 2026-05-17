import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceMemberGuard } from '../workspaces/guards/workspace-member.guard';
import { ActivitiesService } from './activities.service';
import { ActivityEntityType } from './activity-type.enum';

@ApiTags('Activities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  list(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 50,
  ) {
    return this.activitiesService.listForWorkspace(workspaceId, +page, +pageSize);
  }

  @Get('task/:taskId')
  listForTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.activitiesService.listForEntity(ActivityEntityType.TASK, taskId);
  }
}