import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class FeaturedProductsDto {
  @ApiProperty({
    description: 'Collection handles to fetch products from',
    example: ['joeys-faves', 'sale'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  collections!: string[];

  @ApiPropertyOptional({
    description: 'How many products to return per collection',
    example: 4,
    default: 4,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limitPerCollection?: number;
}
