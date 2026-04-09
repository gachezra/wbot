import { Injectable } from '@nestjs/common';
import { ConversationSessionState, WhatsAppNormalizedEvent } from '../types';
import { SessionRegistryService } from './session-registry.service';

@Injectable()
export class SessionManagerService {
  constructor(private readonly sessionRegistry: SessionRegistryService) {}

  getWarmSession(conversationKey: string): ConversationSessionState | null {
    return this.sessionRegistry.getWarmSession(conversationKey);
  }

  spawnSession(
    conversationKey: string,
    event: WhatsAppNormalizedEvent,
  ): ConversationSessionState {
    return this.sessionRegistry.spawnSession(conversationKey, event);
  }

  markSessionActive(sessionId: string): void {
    this.sessionRegistry.markSessionActive(sessionId);
  }

  listWarmSessions(): ConversationSessionState[] {
    return this.sessionRegistry.listWarmSessions();
  }

  expireSession(sessionId: string): void {
    this.sessionRegistry.expireSession(sessionId);
  }

  isExpired(session: ConversationSessionState): boolean {
    return this.sessionRegistry.isExpired(session);
  }

  isHealthy(session: ConversationSessionState): boolean {
    return this.sessionRegistry.isHealthy(session);
  }
}
