import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private health: HealthCheckService) {}

  // Liveness only: "the process is up and serving requests". There is no DB
  // connection configured (the old TypeORM ping always returned 503), and
  // third-party APIs (Shopify, Mangomint) are deliberately left out so their
  // outages don't make Render restart or fail deploys of a healthy app.
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'System health check' })
  @ApiResponse({ status: 200, description: 'System is healthy' })
  check() {
    return this.health.check([]);
  }
}
