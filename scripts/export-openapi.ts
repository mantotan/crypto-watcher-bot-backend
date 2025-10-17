import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

async function exportOpenApiSpec() {
  console.log('🚀 Starting NestJS application to generate OpenAPI spec...');

  const app = await NestFactory.create(AppModule, {
    logger: false, // Disable logging for cleaner output
  });

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
    .addTag('Backtest', 'Backtest task and result management endpoints')
    .addTag('Users', 'User management endpoints')
    .addTag('Trading Accounts', 'Trading account management')
    .addTag('Strategies', 'Trading strategy configuration')
    .addTag('Orders', 'Order management and execution')
    .addTag('Positions', 'Position tracking and management')
    .addTag('Signals', 'Crypto trading signals')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Create docs directory if it doesn't exist
  const docsDir = path.join(__dirname, '..', 'docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // Export as JSON
  const jsonPath = path.join(docsDir, 'openapi.json');
  fs.writeFileSync(jsonPath, JSON.stringify(document, null, 2));
  console.log(`✅ OpenAPI JSON spec exported to: ${jsonPath}`);

  // Export as YAML
  const yamlPath = path.join(docsDir, 'openapi.yaml');
  const yamlContent = yaml.dump(document, { lineWidth: -1 });
  fs.writeFileSync(yamlPath, yamlContent);
  console.log(`✅ OpenAPI YAML spec exported to: ${yamlPath}`);

  console.log('\n📊 API Summary:');
  console.log(`   Title: ${document.info.title}`);
  console.log(`   Version: ${document.info.version}`);
  console.log(`   Total Paths: ${Object.keys(document.paths).length}`);
  console.log(`   Total Tags: ${document.tags?.length || 0}`);

  await app.close();
  console.log('\n✨ Export complete!');
}

exportOpenApiSpec().catch((error) => {
  console.error('❌ Error exporting OpenAPI spec:', error);
  process.exit(1);
});
