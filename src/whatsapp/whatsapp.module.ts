import { Module } from '@nestjs/common';

import { DedupeService } from './services/dedupe.service';
import { LockService } from './services/lock.service';
import { SessionManagerService } from './services/session-manager.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappSignatureService } from './services/whatsapp-signature.service';
import { WhatsappNormalizerService } from './services/whatsapp-normalizer.service';
import { IdleReaperService } from './services/idle-reaper.service';

@Module({
  providers: [
    DedupeService,
    IdleReaperService,
    LockService,
    SessionManagerService,
    WhatsappNormalizerService,
    WhatsappService,
    WhatsappSignatureService,
  ],
  exports: [WhatsappService, WhatsappSignatureService, WhatsappNormalizerService],
})
export class WhatsappModule {}
