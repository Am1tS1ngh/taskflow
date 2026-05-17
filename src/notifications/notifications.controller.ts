import {
    Controller,
    Get,
    Patch,
    Param,
    ParseUUIDPipe,
    Query,
    UseGuards,
    ParseIntPipe,
    DefaultValuePipe,
    ParseBoolPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @Get()
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'unread', required: false, type: Boolean })
    findAll(
        @CurrentUser() user: AuthUser,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
        @Query('unread', new DefaultValuePipe(false), ParseBoolPipe)
        unread: boolean,
    ) {
        return this.notificationsService.findAllForUser(user.id, page, limit, unread);
    }

    @Patch('read-all')
    markAllAsRead(@CurrentUser() user: AuthUser) {
        return this.notificationsService.markAllAsRead(user.id);
    }
    
    @Patch(':id/read')
    markAsRead(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.notificationsService.markAsRead(id, user.id);
    }

}