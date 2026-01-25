import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as compression from 'compression';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  
  // Security middleware
  app.use(helmet());
  
  // Compression middleware
  app.use(compression());
  
  // Enable CORS with specific options
  app.enableCors({
    origin: ['http://localhost:4200', 'http://localhost:3000'], // Add your frontend URLs
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

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  console.log('\n Application is running!');
  console.log(` Server: http://localhost:${port}`);
  console.log(` Swagger Docs: http://localhost:${port}/api/docs`);
  console.log(` Health Check: http://localhost:${port}/api/v1/health\n`);
}
bootstrap();