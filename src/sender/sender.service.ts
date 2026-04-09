import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../shared/app-config.service';
import { SendResult } from '../whatsapp/types';

@Injectable()
export class SenderService {
  private readonly logger = new Logger(SenderService.name);
  private readonly graphApiVersion = 'v19.0';

  constructor(private readonly appConfig: AppConfigService) {}

  async sendText(to: string, body: string): Promise<SendResult> {
    const { phoneNumberId, accessToken } = this.appConfig.whatsapp;
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Send failed to ${to}: HTTP ${response.status} — ${errorBody}`);
        return {
          ok: false,
          statusCode: response.status,
          error: errorBody,
        };
      } else {
        const data = (await response.json()) as { messages?: Array<{ id?: string }> };
        const providerMessageId = data.messages?.[0]?.id;
        this.logger.log(`Sent to ${to}: "${body.slice(0, 60)}${body.length > 60 ? '…' : ''}"`);
        return {
          ok: true,
          providerMessageId,
          statusCode: response.status,
        };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Network error sending to ${to}: ${error}`);
      return {
        ok: false,
        error,
      };
    }
  }
}
