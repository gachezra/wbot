import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../shared/app-config.service';
import {
  AgentRunInput,
  AgentRunOutput,
  ContextPacket,
  ConversationSessionState,
  MemoryEntry,
} from '../whatsapp/types';

interface LocalAgentResponse {
  sessionId?: string;
  shouldReply?: boolean;
  replyText?: string;
  action?: 'reply' | 'ignore' | 'escalate';
  confidence?: number;
  result?: AgentRunOutput;
}

@Injectable()
export class AgentRuntimeProviderService {
  private readonly logger = new Logger(AgentRuntimeProviderService.name);
  private readonly openrouterUrl = 'https://openrouter.ai/api/v1/chat/completions';

  constructor(private readonly appConfig: AppConfigService) {}

  async run(
    input: AgentRunInput,
    session: ConversationSessionState,
  ): Promise<{ agentSessionId?: string; result: AgentRunOutput }> {
    const provider = this.appConfig.agent.runtimeProvider;

    if (provider === 'local-http') {
      return this.runLocalHttp(input, session);
    }

    return this.runOpenRouter(input, session);
  }

  private async runLocalHttp(
    input: AgentRunInput,
    session: ConversationSessionState,
  ): Promise<{ agentSessionId?: string; result: AgentRunOutput }> {
    const runtimeUrl = this.appConfig.agent.runtimeUrl;
    if (!runtimeUrl) {
      this.logger.warn('AGENT_RUNTIME_URL not set for local-http provider');
      return {
        agentSessionId: session.agentSessionId,
        result: this.fallback(input.context),
      };
    }

    const payload = {
      conversationKey: input.conversationKey,
      agentSessionId: session.agentSessionId,
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

    try {
      const response = await fetch(runtimeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Local agent runtime error ${response.status}: ${errorText}`);
        return {
          agentSessionId: session.agentSessionId,
          result: this.fallback(input.context),
        };
      }

      const data = (await response.json()) as LocalAgentResponse;
      const result = data.result ?? {
        shouldReply: data.shouldReply,
        replyText: data.replyText,
        action: data.action,
        confidence: data.confidence,
      };

      return {
        agentSessionId: data.sessionId ?? session.agentSessionId,
        result: {
          shouldReply: result.shouldReply ?? false,
          replyText: result.replyText,
          action: result.action ?? 'ignore',
          confidence: result.confidence ?? 0,
        },
      };
    } catch (err) {
      this.logger.error(
        `Local agent runtime fetch error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        agentSessionId: session.agentSessionId,
        result: this.fallback(input.context),
      };
    }
  }

  private async runOpenRouter(
    input: AgentRunInput,
    session: ConversationSessionState,
  ): Promise<{ agentSessionId?: string; result: AgentRunOutput }> {
    const { openrouterApiKey, model, systemPrompt } = this.appConfig.agent;

    if (!openrouterApiKey) {
      this.logger.warn('OPENROUTER_API_KEY not set — returning fallback reply');
      return {
        agentSessionId: session.agentSessionId,
        result: this.fallback(input.context),
      };
    }

    const messages = this.buildMessages(systemPrompt, input.context);

    try {
      const response = await fetch(this.openrouterUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openrouterApiKey}`,
          'HTTP-Referer': 'https://github.com/wbot',
          'X-Title': 'wbot',
        },
        body: JSON.stringify({ model, messages, temperature: 0.7 }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`OpenRouter error ${response.status}: ${errorText}`);
        return {
          agentSessionId: session.agentSessionId,
          result: this.fallback(input.context),
        };
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      const replyText = data.choices?.[0]?.message?.content?.trim();

      if (!replyText) {
        return {
          agentSessionId: session.agentSessionId,
          result: this.fallback(input.context),
        };
      }

      return {
        agentSessionId: session.agentSessionId,
        result: {
          shouldReply: true,
          replyText,
          action: 'reply',
          confidence: 1,
        },
      };
    } catch (err) {
      this.logger.error(
        `OpenRouter fetch error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        agentSessionId: session.agentSessionId,
        result: this.fallback(input.context),
      };
    }
  }

  private buildMessages(
    systemPrompt: string,
    context: ContextPacket,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    let system = systemPrompt;
    if (context.summary) {
      system += `\n\nConversation summary so far:\n${context.summary}`;
    }
    messages.push({ role: 'system', content: system });

    for (const entry of context.recentMessages) {
      messages.push({
        role: entry.role === 'user' ? 'user' : 'assistant',
        content: this.entryToContent(entry),
      });
    }

    const lastInHistory = context.recentMessages.at(-1);
    if (context.currentText && lastInHistory?.role !== 'user') {
      messages.push({ role: 'user', content: context.currentText });
    }

    return messages;
  }

  private entryToContent(entry: MemoryEntry): string {
    if (entry.text) {
      return entry.text;
    }

    return `[${entry.messageType} message]`;
  }

  private fallback(context: ContextPacket): AgentRunOutput {
    const isFirstMessage = context.recentMessages.length === 0;
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
