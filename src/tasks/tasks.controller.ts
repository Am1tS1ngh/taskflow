import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceMemberGuard } from '../workspaces/guards/workspace-member.guard';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/projects/:projectId/tasks')
export class TasksController {
    constructor(private readonly tasksService: TasksService) { }

    @Post()
    create(
        @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Body() dto: CreateTaskDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.tasksService.create(workspaceId, projectId, dto, user.id);
    }

    @Get()
    list(
        @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Query() query: ListTasksQueryDto,
    ) {
        return this.tasksService.listInProject(workspaceId, projectId, query);
    }

    @Get(':id')
    findOne(
        @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        return this.tasksService.findById(workspaceId, projectId, id);
    }

    @Get(':id/subtree')
    getSubtree(
        @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        return this.tasksService.getSubtree(workspaceId, projectId, id);
    }

    @Patch(':id')
    update(
        @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateTaskDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.tasksService.update(workspaceId, projectId, id, dto, user.id);
    }

    @Delete(':id')
    @HttpCode(204)
    remove(
        @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.tasksService.remove(workspaceId, projectId, id, user.id);
    }
}