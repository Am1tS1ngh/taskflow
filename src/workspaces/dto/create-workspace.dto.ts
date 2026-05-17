import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'Acme Engineering', minLength: 2, maxLength: 100 })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'Where the magic happens', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
