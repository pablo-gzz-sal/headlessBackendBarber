import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CollectionQueryDto {
  @ApiPropertyOptional({ 
    description: 'Number of collections to return', 
    minimum: 1, 
    maximum: 250,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(250)
  limit?: number;

  @ApiPropertyOptional({ 
    description: 'Collection title filter' 
  })
  @IsOptional()
  @IsString()
  title?: string;
}