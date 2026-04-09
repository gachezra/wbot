import { Injectable } from '@nestjs/common';

import { ContextPacket, WhatsAppNormalizedEvent } from '../whatsapp/types';
import { MemoryService } from '../memory/memory.service';

@Injectable()
export class ContextBuilderService {
  constructor(private readonly memory: MemoryService) {}

  async build(
    conversationKey: string,
    event: WhatsAppNormalizedEvent,
  ): Promise<ContextPacket> {
    const [recentMessages, summary] = await Promise.all([
      this.memory.readRecent(conversationKey),
      this.memory.readSummary(conversationKey),
    ]);

    return {
      conversationKey,
      recentMessages,
      summary,
      currentText: event.text ?? null,
      currentMessageType: event.eventType === 'message' ? 'text' : event.eventType,
    };
  }
}
