import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
    @ApiProperty({ example: 'Jane Doe', minLength: 2, maxLength: 100 })
    @IsString()
    @MinLength(2)
    @MaxLength(100)
    name!: string;

    @ApiProperty({ example: 'jane@example.com' })
    @IsEmail()
    email!: string;

    @ApiProperty({ example: 'Secret123!', minLength: 8 })
    @IsString()
    @MinLength(8)
    @MaxLength(72)  // bcrypt's limit
    @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
        message: 'Password must contain at least one lowercase, one uppercase, and one digit',
    })
    password!: string;
}