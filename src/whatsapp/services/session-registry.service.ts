import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';

import { AppConfigService } from '../../shared/app-config.service';
import { ConversationSessionState, WhatsAppNormalizedEvent } from '../types';

@Injectable()
export class SessionRegistryService implements OnModuleInit {
  private readonly logger = new Logger(SessionRegistryService.name);
  private readonly sessions = new Map<string, ConversationSessionState>();
  private readonly filePath = resolve(process.cwd(), 'data', 'sessions', 'registry.json');

  constructor(private readonly appConfig: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    await mkdir(resolve(process.cwd(), 'data', 'sessions'), { recursive: true });

    try {
      const raw = await readFile(this.filePath, 'utf8');
      const records = JSON.parse(raw) as ConversationSessionState[];
      for (const record of records) {
        if (record?.conversationKey) {
          this.sessions.set(record.conversationKey, record);
        }
      }
    } catch {
      // First boot or unreadable file; start clean.
    }
  }

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
    void this.persist();
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
    void this.persist();
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
    void this.persist();
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
    void this.persist();
  }

  noteSummaryUpdated(conversationKey: string): void {
    const session = this.sessions.get(conversationKey);
    if (!session) {
      return;
    }

    session.lastSummaryAt = new Date().toISOString();
    void this.persist();
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
      void this.persist();
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

  private async persist(): Promise<void> {
    await writeFile(this.filePath, JSON.stringify([...this.sessions.values()], null, 2), 'utf8');
  }
}
