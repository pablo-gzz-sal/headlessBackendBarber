import { Module } from '@nestjs/common';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerAccountService } from './customer-account.service';
import { CustomerController } from './customer.controller';

@Module({
  controllers: [CustomerAuthController, CustomerController],
  providers: [CustomerAuthService, CustomerAccountService],
})
export class CustomerAuthModule {}
