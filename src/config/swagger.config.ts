import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';

export class SwaggerConfig {
  static setup(app: INestApplication): void {
    const config = new DocumentBuilder()
      .setTitle('Crypto Watcher Bot API')
      .setDescription('API for crypto trading signal bot with automated order execution')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('Authentication', 'User authentication and authorization endpoints')
      .addTag('Users', 'User management endpoints')
      .addTag('Trading Accounts', 'Trading account management')
      .addTag('Strategies', 'Trading strategy configuration')
      .addTag('Orders', 'Order management and execution')
      .addTag('Positions', 'Position tracking and management')
      .addTag('Signals', 'Crypto trading signals')
      .build();

    const document = SwaggerModule.createDocument(app, config);

    // Setup Scalar API documentation UI
    app.use(
      '/api/docs',
      apiReference({
        spec: {
          content: document,
        },
        theme: 'purple',
        layout: 'modern',
      }),
    );
  }
}
