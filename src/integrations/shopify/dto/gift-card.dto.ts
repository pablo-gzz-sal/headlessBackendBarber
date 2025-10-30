import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateGiftCardDto {
  @ApiProperty({ description: 'Initial value of the gift card' })
  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  initial_value: number;

  @ApiPropertyOptional({ description: 'Customer ID to associate with' })
  @IsOptional()
  @IsString()
  customer_id?: string;

  @ApiPropertyOptional({ description: 'Note about the gift card' })
  @IsOptional()
  @IsString()
  note?: string;
}