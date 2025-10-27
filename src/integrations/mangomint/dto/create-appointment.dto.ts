import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsEmail,
} from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty({ description: 'Customer email' })
  @IsEmail()
  @IsNotEmpty()
  customerEmail: string;

  @ApiProperty({ description: 'Customer first name' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ description: 'Customer last name' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ description: 'Customer phone number' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ description: 'Service ID' })
  @IsString()
  @IsNotEmpty()
  serviceId: string;

  @ApiProperty({ description: 'Staff ID (optional)' })
  @IsString()
  @IsOptional()
  staffId?: string;

  @ApiProperty({
    description: 'Appointment date and time (ISO 8601 format)',
    example: '2025-10-28T14:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  appointmentDateTime: string;

  @ApiProperty({ description: 'Notes (optional)' })
  @IsString()
  @IsOptional()
  notes?: string;
}
