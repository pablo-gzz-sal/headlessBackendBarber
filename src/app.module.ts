import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ShopifyModule } from './integrations/shopify/shopify.module';
import { MangomintModule } from './integrations/mangomint/mangomint.module';
import { HealthModule } from './health/health.module';
import { CustomerAuthModule } from './modules/customer-auth/customer-auth.module';
import { ContactModule } from './modules/contact/contact.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100, 
      },
    ]),


    ShopifyModule,
    MangomintModule,
    HealthModule,
    CustomerAuthModule,
    ContactModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
