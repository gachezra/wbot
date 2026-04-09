import { Request } from 'express';

export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

export interface WhatsAppNormalizedEvent {
  eventId: string;
  messageId?: string;
  eventType: 'message' | 'status' | 'unknown';
  from: string;
  text?: string;
  timestamp?: string;
  payload: Record<string, unknown>;
}

export interface ConversationSessionState {
  conversationKey: string;
  sessionId: string;
  status: 'warm' | 'busy' | 'expired' | 'failed';
  lastActivityAt: string;
  lastSummaryAt: string;
  unresolvedThreads: string[];
  activeMessageId?: string;
  health: 'ok' | 'degraded' | 'failed';
}
