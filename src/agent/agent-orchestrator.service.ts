import { Injectable, Logger } from '@nestjs/common';

import {
  ContextPacket,
  OrchestratorResult,
  WhatsAppNormalizedEvent,
} from '../whatsapp/types';
import { AgentRuntimeService } from './agent-runtime.service';

@Injectable()
export class AgentOrchestratorService {
  private readonly logger = new Logger(AgentOrchestratorService.name);

  constructor(private readonly agentRuntime: AgentRuntimeService) {}

  async handle(input: {
    conversationKey: string;
    event: WhatsAppNormalizedEvent;
    context: ContextPacket;
  }): Promise<OrchestratorResult> {
    const result = await this.agentRuntime.run(input);
    const replyText = typeof result.replyText === 'string' ? result.replyText.trim() : '';

    return {
      shouldReply: result.shouldReply && replyText.length > 0,
      replyText,
      action: result.action,
      confidence: result.confidence,
    };
  }
}
