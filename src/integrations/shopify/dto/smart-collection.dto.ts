import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class CollectionRuleDto {
  @ApiProperty({ description: 'Column to filter on', example: 'tag' })
  @IsString()
  @IsNotEmpty()
  column: string;

  @ApiProperty({ description: 'Relation operator', example: 'equals' })
  @IsString()
  @IsNotEmpty()
  relation: string;

  @ApiProperty({ description: 'Condition value', example: 'sale' })
  @IsString()
  @IsNotEmpty()
  condition: string;
}

export class CreateSmartCollectionDto {
  @ApiProperty({ description: 'Collection title', example: "Joey's Faves" })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'Collection description' })
  @IsOptional()
  @IsString()
  body_html?: string;

  @ApiProperty({ description: 'Rules for the collection', type: [CollectionRuleDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CollectionRuleDto)
  rules: CollectionRuleDto[];

  @ApiPropertyOptional({ description: 'Rules disjunctive (OR vs AND)', default: false })
  @IsOptional()
  @IsBoolean()
  disjunctive?: boolean;

  @ApiPropertyOptional({ description: 'Sort order', example: 'best-selling' })
  @IsOptional()
  @IsString()
  sort_order?: string;

  @ApiPropertyOptional({ description: 'Published status', default: true })
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}