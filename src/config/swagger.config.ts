import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';

export class SwaggerConfig {
  static setup(app: INestApplication): void {
    const nodeEnv = process.env.NODE_ENV;
    const enableSwagger = process.env.ENABLE_SWAGGER === 'true';

    // Disable Swagger in production unless explicitly enabled
    if (nodeEnv === 'production' && !enableSwagger) {
      console.log('⚠️  Swagger/OpenAPI documentation disabled in production environment');
      console.log('   Set ENABLE_SWAGGER=true to enable (not recommended for security)');
      return;
    }

    // Warn if enabled in production
    if (nodeEnv === 'production' && enableSwagger) {
      console.warn('⚠️  WARNING: Swagger/OpenAPI documentation is ENABLED in production!');
      console.warn('   This exposes your API structure and should only be used for debugging.');
    }

    const config = new DocumentBuilder()
      .setTitle('Crypto Watcher Bot API')
      .setDescription(
        'API for crypto trading signal bot with automated order execution\n\n' +
        '🔐 **Authentication:** This API uses HTTP-only cookies for authentication (NOT Authorization headers).\n' +
        'After logging in, tokens are automatically set as secure cookies and sent with each request.\n' +
        'Enable "Include credentials" in your API client to test protected endpoints.'
      )
      .setVersion('1.0')
      .addTag('Authentication', 'User authentication and authorization endpoints')
      .addTag('Backtest', 'Backtest task and result management endpoints')
      .addTag('Users', 'User management endpoints')
      .addTag('Trading Accounts', 'Trading account management')
      .addTag('Strategies', 'Trading strategy configuration')
      .addTag('Orders', 'Order management and execution')
      .addTag('Positions', 'Position tracking and management')
      .addTag('Signals', 'Crypto trading signals')
      .build();

    const document = SwaggerModule.createDocument(app, config);

    // Expose OpenAPI JSON spec at /api-json
    SwaggerModule.setup('api-json', app, document, {
      jsonDocumentUrl: '/api-json.json',
      yamlDocumentUrl: '/api-json.yaml',
    });

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

    console.log(`✅ Swagger/OpenAPI documentation enabled at /api/docs`);
  }
}
