import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ProductQueryDto {
  @ApiPropertyOptional({ 
    description: 'Number of products to return', 
    minimum: 1, 
    maximum: 250,
    default: 10 
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(250)
  limit?: number = 10;

  @ApiPropertyOptional({ 
    description: 'Filter by collection ID' 
  })
  @IsOptional()
  @IsString()
  collectionId?: string;

  @ApiPropertyOptional({ 
    description: 'Filter by product status',
    enum: ['active', 'archived', 'draft']
  })
  @IsOptional()
  @IsString()
  status?: string;
}