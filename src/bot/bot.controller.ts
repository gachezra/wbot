import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WhatsappSignatureService } from '../whatsapp/services/whatsapp-signature.service';
import { WhatsappNormalizerService } from '../whatsapp/services/whatsapp-normalizer.service';
import { RawBodyRequest } from '../whatsapp/types';
import { BotService } from './bot.service';

@ApiTags('Webhook')
@Controller('webhooks/whatsapp')
export class BotController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly signatureService: WhatsappSignatureService,
    private readonly normalizer: WhatsappNormalizerService,
    private readonly botService: BotService,
  ) {}

  /**
   * Meta calls this once with ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…
   * to verify ownership of the webhook URL. Must respond with the challenge string.
   */
  @Get()
  @ApiOperation({ summary: 'Meta webhook verification challenge' })
  @ApiResponse({ status: 200, description: 'Returns the hub.challenge string' })
  @ApiResponse({ status: 400, description: 'Verification failed' })
  handleHandshake(
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): void {
    try {
      const challenge = this.whatsappService.verifyWebhookHandshake(query);
      // Must send plain text, not JSON — that's why we use @Res() here
      res.status(200).send(challenge);
    } catch {
      res.status(400).json({ statusCode: 400, message: 'Webhook verification failed' });
    }
  }

  /**
   * Meta delivers all inbound messages and status updates here.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive WhatsApp message events' })
  @ApiResponse({ status: 200, description: 'Event accepted' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleWebhook(@Req() req: RawBodyRequest): Promise<{ status: string; eventId: string }> {
    try {
      this.signatureService.verifySignature(
        req.headers['x-hub-signature-256'] as string | undefined,
        req.rawBody,
      );
    } catch {
      throw new UnauthorizedException('Invalid WhatsApp signature');
    }

    const event = this.normalizer.normalize(req.body as Record<string, unknown>);
    this.botService.logStructuredEvent(event);

    if (event.eventType === 'message' && event.from !== 'unknown') {
      await this.botService.sendWelcomeMessage(event.from);
    }

    return { status: 'ok', eventId: event.eventId };
  }
}
