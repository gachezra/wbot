import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { appendFile, mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';

import { AppConfigService } from '../shared/app-config.service';
import { MemoryEntry, WhatsAppNormalizedEvent } from '../whatsapp/types';

@Injectable()
export class MemoryService implements OnModuleInit {
  private readonly logger = new Logger(MemoryService.name);
  private readonly dataRoot = resolve(process.cwd(), 'data');

  constructor(private readonly appConfig: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    await mkdir(resolve(this.dataRoot, 'messages'), { recursive: true });
    await mkdir(resolve(this.dataRoot, 'summaries'), { recursive: true });
    this.logger.log(`Memory store ready → ${this.dataRoot}`);
  }

  /** Persist an inbound user message. */
  async writeInbound(conversationKey: string, event: WhatsAppNormalizedEvent): Promise<void> {
    const entry: MemoryEntry = {
      role: 'user',
      text: event.text ?? `[${event.eventType} event — no text]`,
      timestamp: event.timestamp
        ? new Date(Number(event.timestamp) * 1000).toISOString()
        : new Date().toISOString(),
      messageId: event.messageId ?? event.eventId,
      messageType: 'text',
    };

    await this.appendEntry(conversationKey, entry);
  }

  /** Persist an outbound assistant reply. */
  async writeOutbound(conversationKey: string, text: string): Promise<void> {
    const entry: MemoryEntry = {
      role: 'assistant',
      text,
      timestamp: new Date().toISOString(),
      messageId: `out:${Date.now()}`,
      messageType: 'text',
    };

    await this.appendEntry(conversationKey, entry);
  }

  /** Read the last N entries for a conversation. */
  async readRecent(conversationKey: string, limit?: number): Promise<MemoryEntry[]> {
    const maxItems = limit ?? this.appConfig.retrieval.maxRecentItems;
    const filePath = this.messagesPath(conversationKey);

    try {
      const raw = await readFile(filePath, 'utf8');
      const lines = raw.trim().split('\n').filter(Boolean);
      const entries = lines
        .map((line) => {
          try {
            return JSON.parse(line) as MemoryEntry;
          } catch {
            return null;
          }
        })
        .filter((e): e is MemoryEntry => e !== null);

      return entries.slice(-maxItems);
    } catch {
      // File not found — first message in conversation
      return [];
    }
  }

  /** Persist a summary for a conversation. */
  async writeSummary(conversationKey: string, summary: string): Promise<void> {
    const record = { summary, updatedAt: new Date().toISOString() };
    await writeFile(this.summaryPath(conversationKey), JSON.stringify(record, null, 2), 'utf8');
  }

  /** Read the persisted summary for a conversation, or null. */
  async readSummary(conversationKey: string): Promise<string | null> {
    try {
      const raw = await readFile(this.summaryPath(conversationKey), 'utf8');
      const record = JSON.parse(raw) as { summary: string };
      return record.summary ?? null;
    } catch {
      return null;
    }
  }

  private async appendEntry(conversationKey: string, entry: MemoryEntry): Promise<void> {
    const filePath = this.messagesPath(conversationKey);
    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, JSON.stringify(entry) + '\n', 'utf8');
  }

  // Sanitise conversation key for use as a filesystem path segment
  private safeKey(conversationKey: string): string {
    return conversationKey.replace(/[^a-zA-Z0-9_:-]/g, '_');
  }

  private messagesPath(conversationKey: string): string {
    return resolve(this.dataRoot, 'messages', `${this.safeKey(conversationKey)}.jsonl`);
  }

  private summaryPath(conversationKey: string): string {
    return resolve(this.dataRoot, 'summaries', `${this.safeKey(conversationKey)}.json`);
  }
}
