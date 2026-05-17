import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { TaskStatus } from '../task-status.enum';
import { TaskPriority } from '../task-priority.enum';

export class CreateTaskDto {
  @ApiProperty({ example: 'Wire up the new auth flow', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ enum: TaskStatus, required: false })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiProperty({ enum: TaskPriority, required: false })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiProperty({ example: '2026-12-31T17:00:00.000Z', required: false })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiProperty({ required: false, description: 'User ID of assignee' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiProperty({ required: false, description: 'Parent task ID for subtasks' })
  @IsOptional()
  @IsUUID()
  parentTaskId?: string;
}