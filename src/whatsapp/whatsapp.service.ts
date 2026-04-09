import { Injectable, Logger } from '@nestjs/common';
import { ParsedQs } from 'qs';

import { AppConfigService } from '../shared/app-config.service';
import { DedupeService } from './services/dedupe.service';
import { LockService } from './services/lock.service';
import { SessionManagerService } from './services/session-manager.service';
import { WhatsappNormalizerService } from './services/whatsapp-normalizer.service';
import { WhatsAppNormalizedEvent } from './types';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly dedupeService: DedupeService,
    private readonly lockService: LockService,
    private readonly normalizer: WhatsappNormalizerService,
    private readonly sessionManager: SessionManagerService,
  ) {}

  getVerifyToken(): string {
    return this.appConfig.whatsapp.verifyToken;
  }

  verifyWebhookHandshake(query: ParsedQs): string {
    const mode = this.getFirstQueryValue(query['hub.mode']);
    const verifyToken = this.getFirstQueryValue(query['hub.verify_token']);
    const challenge = this.getFirstQueryValue(query['hub.challenge']);

    if (
      mode !== 'subscribe' ||
      verifyToken !== this.getVerifyToken() ||
      !challenge
    ) {
      throw new Error('Webhook verification failed');
    }

    return challenge;
  }

  processWebhook(payload: Record<string, any>) {
    const event = this.normalizer.normalize(payload);

    if (this.shouldIgnoreEvent(event)) {
      return {
        status: 'ignored',
        reason: 'non_actionable_event',
        eventId: event.eventId,
      };
    }

    if (this.dedupeService.isDuplicate(event.messageId ?? event.eventId)) {
      return {
        status: 'duplicate_ignored',
        eventId: event.eventId,
      };
    }

    const conversationKey = this.normalizer.deriveConversationKey(event);
    const lockAcquired = this.lockService.acquire(conversationKey);

    if (!lockAcquired) {
      return {
        status: 'busy_retry_later',
        conversationKey,
      };
    }

    try {
      let session = this.sessionManager.getWarmSession(conversationKey);

      if (
        !session ||
        !this.appConfig.sessions.resumeWarmSessions ||
        !this.sessionManager.isHealthy(session)
      ) {
        session = this.sessionManager.spawnSession(conversationKey, event);
      } else {
        this.sessionManager.markSessionActive(session.sessionId);
      }

      const result = this.buildStubResult(event, conversationKey, session.sessionId);
      this.logger.log(
        `Processed ${event.eventType} event ${event.eventId} for ${conversationKey}`,
      );

      return result;
    } finally {
      this.lockService.release(conversationKey);
    }
  }

  private shouldIgnoreEvent(event: WhatsAppNormalizedEvent): boolean {
    return event.eventType === 'status' || event.eventType === 'unknown';
  }

  private buildStubResult(
    event: WhatsAppNormalizedEvent,
    conversationKey: string,
    sessionId: string,
  ) {
    return {
      status: 'processed',
      conversationKey,
      sessionId,
      event: {
        eventId: event.eventId,
        messageId: event.messageId,
        eventType: event.eventType,
        from: event.from,
        text: event.text,
      },
      contextPolicy: {
        recentContextHours: this.appConfig.retrieval.recentContextHours,
        includePersistentSummary:
          this.appConfig.retrieval.includePersistentSummary,
        includeUnresolvedThreads:
          this.appConfig.retrieval.includeUnresolvedThreads,
        deepSearchEnabled: this.appConfig.retrieval.deepSearchEnabled,
      },
      actionPolicy: {
        allowAutonomousRead: this.appConfig.actioning.allowAutonomousRead,
        allowAutonomousReply: this.appConfig.actioning.allowAutonomousReply,
        approvalThreshold:
          this.appConfig.actioning.requireApprovalAboveRisk,
      },
      outcome: {
        shouldReply: false,
        actualActionTaken: 'none',
        reason: 'Webhook accepted and staged for downstream agent integration',
      },
    };
  }

  private getFirstQueryValue(
    value: string | ParsedQs | (string | ParsedQs)[] | undefined,
  ): string | undefined {
    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      const [firstValue] = value;
      return typeof firstValue === 'string' ? firstValue : undefined;
    }

    return undefined;
  }
}
