import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../shared/app-config.service';

@Injectable()
export class DedupeService {
  private readonly seenEvents = new Map<string, number>();

  constructor(private readonly appConfig: AppConfigService) {}

  isDuplicate(eventId: string): boolean {
    this.prune();

    if (this.seenEvents.has(eventId)) {
      return true;
    }

    const expiresAt =
      Date.now() + this.appConfig.whatsapp.dedupeWindowSeconds * 1000;
    this.seenEvents.set(eventId, expiresAt);

    return false;
  }

  private prune(): void {
    const now = Date.now();

    for (const [eventId, expiresAt] of this.seenEvents.entries()) {
      if (expiresAt <= now) {
        this.seenEvents.delete(eventId);
      }
    }
  }
}
