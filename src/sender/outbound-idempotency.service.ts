import { Injectable, OnModuleInit } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';

interface OutboundIdempotencyRecord {
  inboundMessageId: string;
  conversationKey: string;
  sent: boolean;
  outboundProviderMessageId?: string;
  timestamp: string;
}

@Injectable()
export class OutboundIdempotencyService implements OnModuleInit {
  private readonly filePath = resolve(process.cwd(), 'data', 'sender', 'outbound-idempotency.json');
  private readonly records = new Map<string, OutboundIdempotencyRecord>();

  async onModuleInit(): Promise<void> {
    await mkdir(resolve(process.cwd(), 'data', 'sender'), { recursive: true });

    try {
      const raw = await readFile(this.filePath, 'utf8');
      const records = JSON.parse(raw) as OutboundIdempotencyRecord[];
      for (const record of records) {
        if (record?.inboundMessageId) {
          this.records.set(record.inboundMessageId, record);
        }
      }
    } catch {
      // First boot or unreadable file; start clean.
    }
  }

  hasSuccessfulSend(inboundMessageId: string): boolean {
    return this.records.get(inboundMessageId)?.sent === true;
  }

  async recordResult(input: {
    inboundMessageId: string;
    conversationKey: string;
    sent: boolean;
    outboundProviderMessageId?: string;
  }): Promise<void> {
    this.records.set(input.inboundMessageId, {
      inboundMessageId: input.inboundMessageId,
      conversationKey: input.conversationKey,
      sent: input.sent,
      outboundProviderMessageId: input.outboundProviderMessageId,
      timestamp: new Date().toISOString(),
    });

    await this.persist();
  }

  private async persist(): Promise<void> {
    await writeFile(this.filePath, JSON.stringify([...this.records.values()], null, 2), 'utf8');
  }
}
