import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsBoolean } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ description: 'Customer first name' })
  @IsString()
  @IsNotEmpty()
  first_name: string;

  @ApiProperty({ description: 'Customer last name' })
  @IsString()
  @IsNotEmpty()
  last_name: string;

  @ApiProperty({ description: 'Customer email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ description: 'Customer phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Accept marketing' })
  @IsOptional()
  @IsBoolean()
  accepts_marketing?: boolean;

  @ApiPropertyOptional({ description: 'Customer tags (comma-separated)' })
  @IsOptional()
  @IsString()
  tags?: string;
}