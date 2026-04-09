import { Request } from 'express';

export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

// ── Memory ────────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  messageId: string;
  messageType: string;
}

// ── Context ───────────────────────────────────────────────────────────────────

export interface ContextPacket {
  conversationKey: string;
  recentMessages: MemoryEntry[];
  summary: string | null;
  currentText: string | null;
  currentMessageType: string;
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export interface OrchestratorResult {
  shouldReply: boolean;
  replyText: string;
  action: 'reply' | 'ignore' | 'escalate';
  confidence: number;
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
