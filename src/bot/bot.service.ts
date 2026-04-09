import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../shared/app-config.service';
import { WhatsAppNormalizedEvent } from '../whatsapp/types';

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private readonly graphApiVersion = 'v19.0';

  constructor(private readonly appConfig: AppConfigService) {}

  logStructuredEvent(event: WhatsAppNormalizedEvent): void {
    this.logger.log(
      JSON.stringify(
        {
          eventId: event.eventId,
          messageId: event.messageId,
          eventType: event.eventType,
          from: event.from,
          text: event.text ?? null,
          timestamp: event.timestamp ?? null,
        },
        null,
        2,
      ),
    );
  }

  async sendWelcomeMessage(to: string): Promise<void> {
    const { phoneNumberId, accessToken } = this.appConfig.whatsapp;
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${phoneNumberId}/messages`;

    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        body: '👋 Hello! Your message was received. A human or automated response will follow shortly.',
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `Failed to send welcome message to ${to}: HTTP ${response.status} — ${errorBody}`,
        );
      } else {
        this.logger.log(`Welcome message sent to ${to}`);
      }
    } catch (err) {
      this.logger.error(
        `Network error sending welcome message to ${to}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
