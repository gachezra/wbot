import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../shared/app-config.service';
import {
  AgentRunInput,
  AgentRunOutput,
  ConversationSessionState,
} from '../whatsapp/types';

type RuntimeAction = AgentRunOutput['action'];

interface LocalAgentEnvelope {
  sessionId?: string;
  result?: {
    shouldReply?: unknown;
    replyText?: unknown;
    action?: unknown;
    confidence?: unknown;
  };
}

@Injectable()
export class AgentRuntimeProviderService {
  private readonly logger = new Logger(AgentRuntimeProviderService.name);

  constructor(private readonly appConfig: AppConfigService) {}

  async run(
    input: AgentRunInput,
    session: ConversationSessionState,
  ): Promise<{ agentSessionId?: string; result: AgentRunOutput }> {
    const payload = {
      conversationKey: input.conversationKey,
      agentSessionId: session.agentSessionId || null,
      currentMessage: input.context.currentText,
      currentMessageType: input.context.currentMessageType,
      recentMessages: input.context.recentMessages,
      summary: input.context.summary,
      event: {
        eventId: input.event.eventId,
        messageId: input.event.messageId,
        from: input.event.from,
        timestamp: input.event.timestamp,
      },
      instructions: [
        'Reply as a concise WhatsApp assistant',
        'Use prior context when relevant',
        'Do not claim memory you do not have',
        'Return structured JSON only',
      ],
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.appConfig.agent.runtimeTimeoutMs);

    try {
      const response = await fetch(this.appConfig.agent.runtimeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Local agent runtime error ${response.status}: ${errorText}`);
        return {
          agentSessionId: session.agentSessionId,
          result: this.fallback(input),
        };
      }

      const data = (await response.json()) as LocalAgentEnvelope;
      const result = this.validateEnvelope(data);
      if (!result) {
        this.logger.error('Local agent runtime returned an invalid envelope');
        return {
          agentSessionId: session.agentSessionId,
          result: this.fallback(input),
        };
      }

      return {
        agentSessionId:
          typeof data.sessionId === 'string' && data.sessionId.trim().length > 0
            ? data.sessionId
            : session.agentSessionId,
        result,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        this.logger.error(
          `Local agent runtime timeout after ${this.appConfig.agent.runtimeTimeoutMs}ms`,
        );
      } else {
        this.logger.error(
          `Local agent runtime fetch error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      return {
        agentSessionId: session.agentSessionId,
        result: this.fallback(input),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private validateEnvelope(data: LocalAgentEnvelope): AgentRunOutput | null {
    if (!data || typeof data !== 'object' || !data.result || typeof data.result !== 'object') {
      return null;
    }

    const { shouldReply, replyText, action, confidence } = data.result;
    if (typeof shouldReply !== 'boolean') {
      return null;
    }

    if (!this.isAction(action)) {
      return null;
    }

    if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
      return null;
    }

    if (shouldReply) {
      if (typeof replyText !== 'string' || replyText.trim().length === 0) {
        return null;
      }

      return {
        shouldReply: true,
        replyText: replyText.trim(),
        action,
        confidence,
      };
    }

    return {
      shouldReply: false,
      action,
      confidence,
    };
  }

  private isAction(value: unknown): value is RuntimeAction {
    return value === 'reply' || value === 'ignore' || value === 'escalate';
  }

  private fallback(input: AgentRunInput): AgentRunOutput {
    const isFirstMessage = input.context.recentMessages.length === 0;
    const replyText = isFirstMessage
      ? 'Hello! How can I help you today?'
      : "I'm here. How can I help you?";

    return {
      shouldReply: true,
      replyText,
      action: 'reply',
      confidence: 0,
    };
  }
}
