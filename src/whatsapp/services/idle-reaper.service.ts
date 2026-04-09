import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { SessionManagerService } from './session-manager.service';

@Injectable()
export class IdleReaperService {
  private readonly logger = new Logger(IdleReaperService.name);

  constructor(private readonly sessionManager: SessionManagerService) {}

  @Interval(60_000)
  reapIdleSessions(): void {
    for (const session of this.sessionManager.listWarmSessions()) {
      if (!this.sessionManager.isExpired(session)) {
        continue;
      }

      this.logger.log(`Reaping idle session ${session.sessionId}`);
      this.sessionManager.expireSession(session.sessionId);
    }
  }
}
