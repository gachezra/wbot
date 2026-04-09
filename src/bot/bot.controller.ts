import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { AgentOrchestratorService } from '../agent/agent-orchestrator.service';
import { ContextBuilderService } from '../context/context-builder.service';
import { MemoryService } from '../memory/memory.service';
import { OutboundIdempotencyService } from '../sender/outbound-idempotency.service';
import { SenderService } from '../sender/sender.service';
import { DedupeService } from '../whatsapp/services/dedupe.service';
import { LockService } from '../whatsapp/services/lock.service';
import { SessionRegistryService } from '../whatsapp/services/session-registry.service';
import { WhatsappNormalizerService } from '../whatsapp/services/whatsapp-normalizer.service';
import { WhatsappSignatureService } from '../whatsapp/services/whatsapp-signature.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { RawBodyRequest } from '../whatsapp/types';
import { BotService } from './bot.service';

@ApiTags('Webhook')
@Controller('webhooks/whatsapp')
export class BotController {
  private readonly logger = new Logger(BotController.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly signatureService: WhatsappSignatureService,
    private readonly normalizer: WhatsappNormalizerService,
    private readonly dedupeService: DedupeService,
    private readonly lockService: LockService,
    private readonly botService: BotService,
    private readonly memory: MemoryService,
    private readonly contextBuilder: ContextBuilderService,
    private readonly orchestrator: AgentOrchestratorService,
    private readonly outboundIdempotency: OutboundIdempotencyService,
    private readonly sessionRegistry: SessionRegistryService,
    private readonly sender: SenderService,
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
      res.status(200).send(challenge);
    } catch {
      res.status(400).json({ statusCode: 400, message: 'Webhook verification failed' });
    }
  }

  /**
   * Meta delivers all inbound messages and status updates here.
   *
   * Flow:
   *   verify signature → normalise → log → [status: ignore]
   *   → dedupe → lock → write inbound → build context
   *   → orchestrate → send reply → write outbound → release lock
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive WhatsApp message events' })
  @ApiResponse({ status: 200, description: 'Event accepted' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleWebhook(
    @Req() req: RawBodyRequest,
  ): Promise<{ status: string; eventId: string; outcome?: string }> {
    // 1. Signature verification
    try {
      this.signatureService.verifySignature(
        req.headers['x-hub-signature-256'] as string | undefined,
        req.rawBody,
      );
    } catch {
      throw new UnauthorizedException('Invalid WhatsApp signature');
    }

    // 2. Normalise raw payload into a flat event
    const event = this.normalizer.normalize(req.body as Record<string, unknown>);
    this.botService.logStructuredEvent(event);

    // 3. Ignore non-actionable events (status updates, unknown)
    if (event.eventType !== 'message' || event.from === 'unknown') {
      return { status: 'ok', eventId: event.eventId, outcome: 'ignored' };
    }

    // 4. Dedupe — Meta retries are real
    if (this.dedupeService.isDuplicate(event.messageId ?? event.eventId)) {
      this.logger.warn(`Duplicate event ${event.eventId} — skipping`);
      return { status: 'ok', eventId: event.eventId, outcome: 'duplicate' };
    }

    // 5. Per-conversation lock — prevents overlapping agent runs
    const conversationKey = this.normalizer.deriveConversationKey(event);
    if (!this.lockService.acquire(conversationKey)) {
      this.logger.warn(`Conversation ${conversationKey} busy — skipping`);
      return { status: 'ok', eventId: event.eventId, outcome: 'busy' };
    }

    try {
      // 6. Persist inbound message to memory
      await this.memory.writeInbound(conversationKey, event);

      // 7. Build conversation context (recent history + summary)
      const context = await this.contextBuilder.build(conversationKey, event);

      // 8. Orchestrate — call LLM or fallback
      const result = await this.orchestrator.handle({ conversationKey, event, context });

      // 9. Send reply and persist outbound
      if (result.shouldReply && result.replyText) {
        const inboundMessageId = event.messageId ?? event.eventId;
        if (this.outboundIdempotency.hasSuccessfulSend(inboundMessageId)) {
          this.logger.warn(`Outbound send already recorded for ${inboundMessageId}`);
          return {
            status: 'ok',
            eventId: event.eventId,
            outcome: 'duplicate_outbound_blocked',
          };
        }

        const sendResult = await this.sender.sendText(event.from, result.replyText);
        await this.outboundIdempotency.recordResult({
          inboundMessageId,
          conversationKey,
          sent: sendResult.ok,
          outboundProviderMessageId: sendResult.providerMessageId,
        });

        if (!sendResult.ok) {
          return { status: 'ok', eventId: event.eventId, outcome: 'send_failed' };
        }

        await this.memory.writeOutbound(conversationKey, result.replyText);
        await this.memory.updateRollingSummary(
          conversationKey,
          event.text ?? null,
          result.replyText,
        );
        this.sessionRegistry.noteSummaryUpdated(conversationKey);
      }

      return { status: 'ok', eventId: event.eventId, outcome: result.action };
    } finally {
      // Always release the lock — even if something above threw
      this.lockService.release(conversationKey);
    }
  }
}
