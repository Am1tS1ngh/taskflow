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
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceMemberGuard } from '../workspaces/guards/workspace-member.guard';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@ApiTags('Comments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/projects/:projectId/tasks/:taskId/comments')
export class CommentsController {
    constructor(private readonly commentsService: CommentsService) { }

    @Post()
    create(
        @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Param('taskId', ParseUUIDPipe) taskId: string,
        @Body() dto: CreateCommentDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.commentsService.create(workspaceId, projectId, taskId, dto, user.id);
    }

    @Get()
    list(
        @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Param('taskId', ParseUUIDPipe) taskId: string
    ) {
        return this.commentsService.listForTask(workspaceId, projectId, taskId);
    }

    @Patch(':id')
    update(
        @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Param('taskId', ParseUUIDPipe) taskId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateCommentDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.commentsService.update(workspaceId, projectId, taskId, id, dto, user.id);
    }

    @Delete(':id')
    @HttpCode(204)
    remove(
        @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Param('taskId', ParseUUIDPipe) taskId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.commentsService.remove(workspaceId, projectId, taskId, id, user.id);
    }
}