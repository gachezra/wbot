import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { AppConfigService } from '../../shared/app-config.service';
import { ConversationSessionState, WhatsAppNormalizedEvent } from '../types';

@Injectable()
export class SessionManagerService {
  private readonly logger = new Logger(SessionManagerService.name);
  private readonly sessions = new Map<string, ConversationSessionState>();

  constructor(private readonly appConfig: AppConfigService) {}

  getWarmSession(conversationKey: string): ConversationSessionState | null {
    const session = this.sessions.get(conversationKey);
    if (!session) {
      return null;
    }

    if (this.isExpired(session)) {
      this.sessions.delete(conversationKey);
      return null;
    }

    return session;
  }

  spawnSession(
    conversationKey: string,
    event: WhatsAppNormalizedEvent,
  ): ConversationSessionState {
    const now = new Date().toISOString();
    const session: ConversationSessionState = {
      conversationKey,
      sessionId: randomUUID(),
      status: 'warm',
      lastActivityAt: now,
      lastSummaryAt: now,
      unresolvedThreads: [],
      activeMessageId: event.messageId,
      health: 'ok',
    };

    this.sessions.set(conversationKey, session);
    this.logger.log(`Spawned session ${session.sessionId} for ${conversationKey}`);

    return session;
  }

  markSessionActive(sessionId: string): void {
    const session = [...this.sessions.values()].find(
      (candidate) => candidate.sessionId === sessionId,
    );

    if (!session) {
      return;
    }

    session.lastActivityAt = new Date().toISOString();
    session.status = 'warm';
    session.health = 'ok';
  }

  listWarmSessions(): ConversationSessionState[] {
    return [...this.sessions.values()];
  }

  expireSession(sessionId: string): void {
    for (const [conversationKey, session] of this.sessions.entries()) {
      if (session.sessionId !== sessionId) {
        continue;
      }

      session.status = 'expired';
      this.sessions.delete(conversationKey);
      this.logger.log(`Expired session ${sessionId} for ${conversationKey}`);
    }
  }

  isExpired(session: ConversationSessionState): boolean {
    const idleTimeoutMs = this.appConfig.sessions.idleTimeoutSeconds * 1000;
    const lastActivity = new Date(session.lastActivityAt).getTime();
    return Date.now() - lastActivity > idleTimeoutMs;
  }

  isHealthy(session: ConversationSessionState): boolean {
    if (session.health !== 'ok') {
      return false;
    }

    const healthTtlMs = this.appConfig.sessions.warmHealthTtlSeconds * 1000;
    const lastActivity = new Date(session.lastActivityAt).getTime();
    return Date.now() - lastActivity <= healthTtlMs;
  }
}
