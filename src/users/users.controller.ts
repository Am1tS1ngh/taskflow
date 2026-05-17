import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from './user-role.enum';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Get('admin-only')
  @Roles(UserRole.ADMIN)
  adminOnly() {
    return { message: 'You see this only if you are ADMIN' };
  }
}