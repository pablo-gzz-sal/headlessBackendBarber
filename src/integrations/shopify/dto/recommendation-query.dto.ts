import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class RecommendationQueryDto {
  @ApiProperty({ description: 'Product ID to get recommendations for' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ 
    description: 'Number of recommendations to return', 
    minimum: 1, 
    maximum: 10,
    default: 4 
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number = 4;
}