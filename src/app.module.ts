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
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 100,
        },
      ],
      // On Render, requests pass Cloudflare and then Render's proxy, so req.ip
      // (trust proxy = 1) is a Cloudflare edge IP that changes between requests and
      // every visitor gets scattered across random buckets. Cloudflare sets
      // CF-Connecting-IP to the real client and overwrites any client-sent value.
      // Locally the header is absent and req.ip is used.
      getTracker: (req: Record<string, any>) =>
        (req.headers?.['cf-connecting-ip'] as string | undefined) ?? req.ip,
    }),


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
