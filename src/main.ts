import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { SwaggerConfig } from './config/swagger.config';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable cookie parsing for HTTP-only cookie authentication
  app.use(cookieParser());

  // Enable gzip compression for large responses
  app.use(compression());

  // Enable CORS with credentials for HTTP-only cookies
  // Remove quotes from environment variable if present
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3006')
    .replace(/^["']|["']$/g, '')
    .trim();

  console.log(`[CORS] Configured origin: ${frontendUrl}`);

  // Cookie domain configuration
  const cookieDomain = process.env.COOKIE_DOMAIN;
  if (cookieDomain) {
    console.log(`[COOKIES] Configured domain: ${cookieDomain}`);
  } else {
    console.log(`[COOKIES] Using browser default domain (no COOKIE_DOMAIN set)`);
  }

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Postman, or server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin matches the configured frontend URL
      if (origin === frontendUrl) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Blocked request from origin: ${origin} (expected: ${frontendUrl})`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Set-Cookie'],
    maxAge: 86400, // 24 hours - cache preflight requests
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Enable global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are present
      transform: true, // Automatically transform payloads to DTO instances
    }),
  );

  // Setup API documentation
  SwaggerConfig.setup(app);

  const port = process.env.PORT || 3733;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`API Documentation available at: http://localhost:${port}/api/docs`);
}
bootstrap();
