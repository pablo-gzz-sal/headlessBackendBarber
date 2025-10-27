import { Controller, Get, Post, Put, Param, Query, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { MangomintService } from './mangomint.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { AppointmentQueryDto } from './dto/appointment-query.dto';

@ApiTags('MangoMint')
@Controller('mangomint')
export class MangomintController {
  constructor(private readonly mangomintService: MangomintService) {}

  @Get('services')
  @ApiOperation({
    summary: 'Get all services',
    description: 'Fetch all available services for booking',
  })
  @ApiResponse({ status: 200, description: 'Services retrieved successfully' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getServices() {
    return this.mangomintService.getServices();
  }

  @Get('staff')
  @ApiOperation({
    summary: 'Get all staff members',
    description: 'Fetch all staff members available for appointments',
  })
  @ApiResponse({ status: 200, description: 'Staff retrieved successfully' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getStaff() {
    return this.mangomintService.getStaff();
  }

  @Get('availability')
  @ApiOperation({
    summary: 'Get available time slots',
    description: 'Check available time slots for a specific service',
  })
  @ApiQuery({ name: 'serviceId', description: 'Service ID', required: true })
  @ApiQuery({
    name: 'date',
    description: 'Date (YYYY-MM-DD format)',
    required: true,
  })
  @ApiQuery({
    name: 'staffId',
    description: 'Staff ID (optional)',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Available slots retrieved successfully',
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getAvailableSlots(
    @Query('serviceId') serviceId: string,
    @Query('date') date: string,
    @Query('staffId') staffId?: string,
  ) {
    return this.mangomintService.getAvailableSlots(serviceId, date, staffId);
  }

  @Post('appointments')
  @ApiOperation({
    summary: 'Create a new appointment',
    description: 'Book a new appointment',
  })
  @ApiResponse({ status: 201, description: 'Appointment created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async createAppointment(@Body() appointmentData: CreateAppointmentDto) {
    return this.mangomintService.createAppointment(appointmentData);
  }

  @Get('appointments')
  @ApiOperation({
    summary: 'Get appointments',
    description: 'Fetch appointments with optional filters',
  })
  @ApiResponse({
    status: 200,
    description: 'Appointments retrieved successfully',
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getAppointments(@Query() query: AppointmentQueryDto) {
    return this.mangomintService.getAppointments(query);
  }

  @Get('appointments/:id')
  @ApiOperation({
    summary: 'Get appointment by ID',
    description: 'Fetch a single appointment by its ID',
  })
  @ApiParam({ name: 'id', description: 'Appointment ID', type: String })
  @ApiResponse({
    status: 200,
    description: 'Appointment retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getAppointmentById(@Param('id') id: string) {
    return this.mangomintService.getAppointmentById(id);
  }

  @Put('appointments/:id/cancel')
  @ApiOperation({
    summary: 'Cancel an appointment',
    description: 'Cancel an existing appointment',
  })
  @ApiParam({ name: 'id', description: 'Appointment ID', type: String })
  @ApiQuery({
    name: 'reason',
    description: 'Cancellation reason (optional)',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Appointment cancelled successfully',
  })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async cancelAppointment(
    @Param('id') id: string,
    @Query('reason') reason?: string,
  ) {
    return this.mangomintService.cancelAppointment(id, reason);
  }
}
