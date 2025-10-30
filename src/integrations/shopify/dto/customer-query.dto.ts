import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsString, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';

export class CustomerQueryDto {
  @ApiPropertyOptional({ 
    description: 'Number of customers to return', 
    minimum: 1, 
    maximum: 250,
    default: 50 
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(250)
  limit?: number = 50;

  @ApiPropertyOptional({ 
    description: 'Search by email' 
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ 
    description: 'Search by phone' 
  })
  @IsOptional()
  @IsString()
  phone?: string;
}