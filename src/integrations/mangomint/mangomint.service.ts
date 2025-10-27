import { Injectable, InternalServerErrorException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { AppointmentQueryDto } from './dto/appointment-query.dto';

@Injectable()
export class MangomintService {
  private axiosInstance: AxiosInstance;
  private readonly logger = new Logger(MangomintService.name);
  private readonly locationId: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('MANGOMINT_API_KEY');
    const apiUrl = this.configService.get<string>('MANGOMINT_API_URL');
    const locationId = this.configService.get<string>('MANGOMINT_LOCATION_ID');
    this.locationId = locationId!;

    if (!apiKey || !apiUrl || !this.locationId) {
      throw new Error('MangoMint credentials are not configured properly');
    }

    // Initialize Axios instance with MangoMint API config
    this.axiosInstance = axios.create({
      baseURL: apiUrl,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    this.logger.log('MangoMint service initialized successfully');
  }

  /**
   * Get all available services
   */
  async getServices() {
    try {
      const response = await this.axiosInstance.get('/services', {
        params: { location_id: this.locationId },
      });

      return {
        services: response.data.data || response.data,
        count: response.data.data?.length || response.data.length || 0,
      };
    } catch (error) {
      this.logger.error('Failed to fetch services:', error.message);
      throw new InternalServerErrorException('Failed to fetch services from MangoMint');
    }
  }

  /**
   * Get staff members
   */
  async getStaff() {
    try {
      const response = await this.axiosInstance.get('/staff', {
        params: { location_id: this.locationId },
      });

      return {
        staff: response.data.data || response.data,
        count: response.data.data?.length || response.data.length || 0,
      };
    } catch (error) {
      this.logger.error('Failed to fetch staff:', error.message);
      throw new InternalServerErrorException('Failed to fetch staff from MangoMint');
    }
  }

  /**
   * Get available time slots for a service
   */
  async getAvailableSlots(serviceId: string, date: string, staffId?: string) {
    try {
      const params: any = {
        location_id: this.locationId,
        service_id: serviceId,
        date: date,
      };

      if (staffId) {
        params.staff_id = staffId;
      }

      const response = await this.axiosInstance.get('/availability', { params });

      return {
        availableSlots: response.data.data || response.data,
        date: date,
        serviceId: serviceId,
      };
    } catch (error) {
      this.logger.error('Failed to fetch available slots:', error.message);
      throw new InternalServerErrorException('Failed to fetch available slots');
    }
  }

  /**
   * Create a new appointment
   */
  async createAppointment(appointmentData: CreateAppointmentDto) {
    try {
      // First, create or find the customer
      const customer = await this.findOrCreateCustomer({
        email: appointmentData.customerEmail,
        first_name: appointmentData.firstName,
        last_name: appointmentData.lastName,
        phone: appointmentData.phone,
      });

      // Create the appointment
      const response = await this.axiosInstance.post('/appointments', {
        location_id: this.locationId,
        customer_id: customer.id,
        service_id: appointmentData.serviceId,
        staff_id: appointmentData.staffId,
        start_time: appointmentData.appointmentDateTime,
        notes: appointmentData.notes,
      });

      return response.data.data || response.data;
    } catch (error) {
      this.logger.error('Failed to create appointment:', error.message);
      if (error.response?.data) {
        throw new InternalServerErrorException(
          `Failed to create appointment: ${JSON.stringify(error.response.data)}`,
        );
      }
      throw new InternalServerErrorException('Failed to create appointment');
    }
  }

  /**
   * Get appointments with filters
   */
  async getAppointments(query: AppointmentQueryDto) {
    try {
      const params: any = {
        location_id: this.locationId,
      };

      if (query.startDate) {
        params.start_date = query.startDate;
      }

      if (query.endDate) {
        params.end_date = query.endDate;
      }

      if (query.customerEmail) {
        // Find customer first
        const customer = await this.findCustomerByEmail(query.customerEmail);
        if (customer) {
          params.customer_id = customer.id;
        }
      }

      const response = await this.axiosInstance.get('/appointments', { params });

      return {
        appointments: response.data.data || response.data,
        count: response.data.data?.length || response.data.length || 0,
      };
    } catch (error) {
      this.logger.error('Failed to fetch appointments:', error.message);
      throw new InternalServerErrorException('Failed to fetch appointments');
    }
  }

  /**
   * Get appointment by ID
   */
  async getAppointmentById(appointmentId: string) {
    try {
      const response = await this.axiosInstance.get(`/appointments/${appointmentId}`);

      if (!response.data) {
        throw new NotFoundException(`Appointment with ID ${appointmentId} not found`);
      }

      return response.data.data || response.data;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Failed to fetch appointment:', error.message);
      throw new InternalServerErrorException('Failed to fetch appointment details');
    }
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(appointmentId: string, reason?: string) {
    try {
      const response = await this.axiosInstance.put(`/appointments/${appointmentId}/cancel`, {
        cancellation_reason: reason,
      });

      return response.data.data || response.data;
    } catch (error) {
      this.logger.error('Failed to cancel appointment:', error.message);
      throw new InternalServerErrorException('Failed to cancel appointment');
    }
  }

  /**
   * Helper: Find or create customer
   */
  private async findOrCreateCustomer(customerData: any) {
    try {
      // Try to find existing customer
      const existingCustomer = await this.findCustomerByEmail(customerData.email);
      if (existingCustomer) {
        return existingCustomer;
      }

      // Create new customer
      const response = await this.axiosInstance.post('/customers', {
        ...customerData,
        location_id: this.locationId,
      });

      return response.data.data || response.data;
    } catch (error) {
      this.logger.error('Failed to find or create customer:', error.message);
      throw new InternalServerErrorException('Failed to process customer');
    }
  }

  /**
   * Helper: Find customer by email
   */
  private async findCustomerByEmail(email: string) {
    try {
      const response = await this.axiosInstance.get('/customers', {
        params: {
          location_id: this.locationId,
          email: email,
        },
      });

      const customers = response.data.data || response.data;
      return customers.length > 0 ? customers[0] : null;
    } catch (error) {
      this.logger.warn('Failed to find customer by email:', error.message);
      return null;
    }
  }
}