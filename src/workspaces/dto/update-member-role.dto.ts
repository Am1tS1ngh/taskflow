import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { WorkspaceRole } from '../workspace-role.enum';

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: WorkspaceRole, example: WorkspaceRole.ADMIN })
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}