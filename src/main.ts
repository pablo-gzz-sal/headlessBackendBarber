import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import * as compression from 'compression';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Render terminates TLS at its proxy, so without this req.ip is the proxy's
  // address and the ThrottlerGuard would lump every visitor into one bucket.
  // 1 = trust exactly one hop; a higher/`true` value would let clients spoof
  // X-Forwarded-For and dodge rate limits.
  app.set('trust proxy', 1);

  app.use(cookieParser());
  
  // Security middleware
  app.use(helmet());
  
  // Compression middleware
  app.use(compression());
  
  // Enable CORS with specific options
  app.enableCors({
    origin: [
      'http://localhost:4200',
      'http://localhost:3000',
      // Render staging URL. Kept so the pre-domain deploy stays testable after go-live.
      'https://barber-frontend-kura.onrender.com',
      // Production. Both hosts are listed because CORS matches the exact origin, so a
      // www -> apex redirect that the browser has cached still needs www to be allowed.
      'https://josephbattisti.com',
      'https://www.josephbattisti.com',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });
  
  // API versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  
  // Global validation pipe with detailed error messages
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      errorHttpStatusCode: 422,
      stopAtFirstError: false,
    }),
  );

  // Swagger Configuration
  // Not served in production: the public docs listed every endpoint with ready-made
  // example payloads, making endpoints like the contact form trivial for bots to script.
  const swaggerEnabled = process.env.NODE_ENV !== 'production';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Barber Shop API')
      .setDescription('Complete API for managing e-commerce products, orders, customers, and booking appointments')
      .setVersion('1.0')
      .addTag('Shopify', 'E-commerce product and order operations')
      .addTag('Collections', 'Product collections management')
      .addTag('Customers', 'Customer management')
      .addTag('Gift Cards', 'Gift card operations')
      .addTag('MangoMint', 'Booking and appointment management')
      .addTag('Health', 'System health checks')
      .addTag('Contact', 'Website contact form')
      .addBearerAuth()
      .addServer('http://localhost:3000', 'Local Development')
      .addServer('https://api.yourbarber.com', 'Production')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
      },
    });
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  console.log('\n Application is running!');
  console.log(` Server: http://localhost:${port}`);
  if (swaggerEnabled) console.log(` Swagger Docs: http://localhost:${port}/api/docs`);
  console.log(` Health Check: http://localhost:${port}/api/v1/health\n`);
}
bootstrap();