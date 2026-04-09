import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { AppConfigService } from './shared/app-config.service';

async function bootstrap(): Promise<void> {
  // rawBody: true tells NestJS to parse JSON *and* capture req.rawBody on every request.
  // Do NOT add a second json() middleware — it prevents rawBody from being populated.
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const config = app.get(AppConfigService);
  const port = config.port;
  const webhookPath = `/api${config.whatsapp.webhookPath}`;

  app.setGlobalPrefix('api');

  // Swagger
  const swaggerOptions = new DocumentBuilder()
    .setTitle('wbot API')
    .setDescription('WhatsApp Webhook Listener')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerOptions);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);

  Logger.log(
    `Webhook listener ready on http://localhost:${port}${webhookPath}`,
    'Bootstrap',
  );
  Logger.log(
    `Swagger UI available at http://localhost:${port}/api/docs`,
    'Bootstrap',
  );
}

void bootstrap();
