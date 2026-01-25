import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CustomerAccountService } from './customer-account.service';

@Controller('customer')
export class CustomerController {
  constructor(private readonly customerApi: CustomerAccountService) {}

  @Get('me')
  async me(@Req() req: Request) {
    const token = req.cookies?.shopify_customer_access_token;
    if (!token) return { authenticated: false };

    const query = `
      query {
        customer {
          id
          firstName
          lastName
          emailAddress {
            emailAddress
          }
        }
      }
    `;

    const data = await this.customerApi.gql<any>(token, query);
    return { authenticated: true, customer: data.customer };
  }
}
