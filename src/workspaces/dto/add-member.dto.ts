import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { WorkspaceRole } from '../workspace-role.enum';

export class AddMemberDto {
  @ApiProperty({ example: 'newbie@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: WorkspaceRole, example: WorkspaceRole.MEMBER, required: false })
  @IsOptional()
  @IsEnum(WorkspaceRole)
  role?: WorkspaceRole = WorkspaceRole.MEMBER;
}