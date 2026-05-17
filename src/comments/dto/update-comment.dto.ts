import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class UpdateCommentDto {
    @ApiProperty({ minLength: 1, maxLength: 5000 })
    @IsString()
    @MinLength(1)
    @MaxLength(5000)
    body!: string;
}