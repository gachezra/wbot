import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { AppConfigService } from '../../shared/app-config.service';
import { ConversationSessionState, WhatsAppNormalizedEvent } from '../types';

@Injectable()
export class SessionRegistryService {
  private readonly logger = new Logger(SessionRegistryService.name);
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
    const sessionId = randomUUID();
    const session: ConversationSessionState = {
      conversationKey,
      sessionId,
      agentSessionId: sessionId,
      status: 'warm',
      lastActivityAt: now,
      expiresAt: this.computeExpiry(now),
      lastSummaryAt: now,
      unresolvedThreads: [],
      activeMessageId: event.messageId,
      health: 'ok',
    };

    this.sessions.set(conversationKey, session);
    this.logger.log(`Spawned session ${session.sessionId} for ${conversationKey}`);

    return session;
  }

  markSessionBusy(conversationKey: string): void {
    const session = this.sessions.get(conversationKey);
    if (!session) {
      return;
    }

    session.status = 'busy';
    session.lastActivityAt = new Date().toISOString();
    session.expiresAt = this.computeExpiry(session.lastActivityAt);
  }

  markSessionActive(sessionId: string, agentSessionId?: string): void {
    const session = [...this.sessions.values()].find(
      (candidate) => candidate.sessionId === sessionId,
    );

    if (!session) {
      return;
    }

    session.lastActivityAt = new Date().toISOString();
    session.expiresAt = this.computeExpiry(session.lastActivityAt);
    session.status = 'warm';
    session.health = 'ok';
    if (agentSessionId) {
      session.agentSessionId = agentSessionId;
    }
  }

  markSessionFailed(sessionId: string): void {
    const session = [...this.sessions.values()].find(
      (candidate) => candidate.sessionId === sessionId,
    );

    if (!session) {
      return;
    }

    session.status = 'failed';
    session.health = 'failed';
    session.lastActivityAt = new Date().toISOString();
    session.expiresAt = this.computeExpiry(session.lastActivityAt);
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
    return Date.now() > new Date(session.expiresAt).getTime();
  }

  isHealthy(session: ConversationSessionState): boolean {
    if (session.health !== 'ok') {
      return false;
    }

    const healthTtlMs = this.appConfig.sessions.warmHealthTtlSeconds * 1000;
    const lastActivity = new Date(session.lastActivityAt).getTime();
    return Date.now() - lastActivity <= healthTtlMs;
  }

  private computeExpiry(fromIso: string): string {
    const idleTimeoutMs = this.appConfig.sessions.idleTimeoutSeconds * 1000;
    return new Date(new Date(fromIso).getTime() + idleTimeoutMs).toISOString();
  }
}
