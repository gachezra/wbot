import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, Request, Response } from 'express';

import { AppModule } from './app.module';
import { AppConfigService } from './shared/app-config.service';
import { WhatsappService } from './whatsapp/whatsapp.service';
import { WhatsappSignatureService } from './whatsapp/services/whatsapp-signature.service';
import { RawBodyRequest } from './whatsapp/types';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const config = app.get(AppConfigService);
  const whatsappService = app.get(WhatsappService);
  const signatureService = app.get(WhatsappSignatureService);
  const port = config.port;
  const webhookPath = `/api${config.whatsapp.webhookPath}`;

  app.setGlobalPrefix('api');
  app.use(
    webhookPath,
    json({
      limit: config.whatsapp.maxPayloadBytes,
      verify: (request: RawBodyRequest, _response, buffer) => {
        request.rawBody = Buffer.from(buffer);
      },
    }),
  );

  const httpAdapter = app.getHttpAdapter().getInstance();

  httpAdapter.get(webhookPath, (request: Request, response: Response) => {
    try {
      const challenge = whatsappService.verifyWebhookHandshake(request.query);
      response.status(200).send(challenge);
    } catch (error) {
      response.status(400).json({
        statusCode: 400,
        message: error instanceof Error ? error.message : 'Webhook verification failed',
      });
    }
  });

  httpAdapter.post(
    webhookPath,
    (request: RawBodyRequest, response: Response) => {
      try {
        signatureService.verifySignature(
          request.headers['x-hub-signature-256'] as string | undefined,
          request.rawBody,
        );
        response.status(200).json(whatsappService.processWebhook(request.body));
      } catch (error) {
        const statusCode =
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          typeof error.status === 'number'
            ? error.status
            : 400;

        response.status(statusCode).json({
          statusCode,
          message: error instanceof Error ? error.message : 'Webhook intake failed',
        });
      }
    },
  );

  await app.listen(port);

  Logger.log(
    `Webhook listener ready on http://localhost:${port}${webhookPath}`,
    'Bootstrap',
  );
}

void bootstrap();
