import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateMetafieldDto {
  @ApiProperty({ description: 'Namespace for the metafield', example: 'custom' })
  @IsString()
  @IsNotEmpty()
  namespace: string;

  @ApiProperty({ description: 'Key for the metafield', example: 'featured_products' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ description: 'Value for the metafield', example: '["123", "456", "789"]' })
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiProperty({ description: 'Type of the metafield', example: 'json' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiPropertyOptional({ description: 'Description of the metafield' })
  @IsOptional()
  @IsString()
  description?: string;
}