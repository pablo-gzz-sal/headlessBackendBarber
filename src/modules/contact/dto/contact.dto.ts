import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ContactDto {
  @ApiProperty({
    example: 'John Doe',
    minLength: 2,
    maxLength: 80,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty({
    example: 'john@example.com',
    maxLength: 120,
  })
  @IsEmail()
  @MaxLength(120)
  email!: string;

  @ApiPropertyOptional({
    example: '+49 176 12345678',
    maxLength: 40,
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiProperty({
    example: 'Hi Joseph, I would like to book a haircut for Saturday afternoon.',
    minLength: 5,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  message!: string;
}
