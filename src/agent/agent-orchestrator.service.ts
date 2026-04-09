import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../shared/app-config.service';
import { ContextPacket, MemoryEntry, OrchestratorResult } from '../whatsapp/types';

@Injectable()
export class AgentOrchestratorService {
  private readonly logger = new Logger(AgentOrchestratorService.name);
  private readonly openrouterUrl = 'https://openrouter.ai/api/v1/chat/completions';

  constructor(private readonly appConfig: AppConfigService) {}

  async handle(input: {
    conversationKey: string;
    context: ContextPacket;
  }): Promise<OrchestratorResult> {
    const { openrouterApiKey, model, systemPrompt } = this.appConfig.agent;

    if (!openrouterApiKey) {
      this.logger.warn('OPENROUTER_API_KEY not set — returning fallback reply');
      return this.fallback(input.context);
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
        return this.fallback(input.context);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };

      const replyText = data.choices?.[0]?.message?.content?.trim();

      if (!replyText) {
        return this.fallback(input.context);
      }

      this.logger.log(
        `[${input.conversationKey}] Agent reply: "${replyText.slice(0, 80)}${replyText.length > 80 ? '…' : ''}"`,
      );

      return {
        shouldReply: true,
        replyText,
        action: 'reply',
        confidence: 1,
      };
    } catch (err) {
      this.logger.error(
        `OpenRouter fetch error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return this.fallback(input.context);
    }
  }

  private buildMessages(
    systemPrompt: string,
    context: ContextPacket,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    // System prompt + optional summary context
    let system = systemPrompt;
    if (context.summary) {
      system += `\n\nConversation summary so far:\n${context.summary}`;
    }
    messages.push({ role: 'system', content: system });

    // Inject conversation history
    for (const entry of context.recentMessages) {
      messages.push({
        role: entry.role === 'user' ? 'user' : 'assistant',
        content: this.entryToContent(entry),
      });
    }

    // If the current message is not already the last in history, add it
    const lastInHistory = context.recentMessages.at(-1);
    if (context.currentText && lastInHistory?.role !== 'user') {
      messages.push({ role: 'user', content: context.currentText });
    }

    return messages;
  }

  private entryToContent(entry: MemoryEntry): string {
    if (entry.text) return entry.text;
    return `[${entry.messageType} message]`;
  }

  /** Graceful fallback when LLM is unavailable. */
  private fallback(context: ContextPacket): OrchestratorResult {
    const isFirstMessage = context.recentMessages.length === 0;
    const replyText = isFirstMessage
      ? '👋 Hello! How can I help you today?'
      : "I'm here. How can I help you?";

    return {
      shouldReply: true,
      replyText,
      action: 'reply',
      confidence: 0,
    };
  }
}
