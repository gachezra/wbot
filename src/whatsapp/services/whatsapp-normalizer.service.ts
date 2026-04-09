import { Injectable } from '@nestjs/common';

import { WhatsAppNormalizedEvent } from '../types';

@Injectable()
export class WhatsappNormalizerService {
  normalize(payload: Record<string, any>): WhatsAppNormalizedEvent {
    const firstEntry = Array.isArray(payload.entry) ? payload.entry[0] : undefined;
    const firstChange = firstEntry?.changes?.[0];
    const value = firstChange?.value ?? {};
    const message = Array.isArray(value.messages) ? value.messages[0] : undefined;
    const status = Array.isArray(value.statuses) ? value.statuses[0] : undefined;
    const contact = Array.isArray(value.contacts) ? value.contacts[0] : undefined;

    if (message) {
      return {
        eventId: message.id ?? `event:${Date.now()}`,
        messageId: message.id,
        eventType: 'message',
        from: message.from ?? contact?.wa_id ?? 'unknown',
        text: message.text?.body,
        timestamp: message.timestamp,
        payload,
      };
    }

    if (status) {
      return {
        eventId: status.id ?? `status:${Date.now()}`,
        messageId: status.id,
        eventType: 'status',
        from: status.recipient_id ?? 'unknown',
        timestamp: status.timestamp,
        payload,
      };
    }

    return {
      eventId: `unknown:${Date.now()}`,
      eventType: 'unknown',
      from: 'unknown',
      payload,
    };
  }

  deriveConversationKey(event: WhatsAppNormalizedEvent): string {
    return `whatsapp:dm:${event.from}`;
  }
}
