import { Module } from '@nestjs/common';

import { OutboundIdempotencyService } from './outbound-idempotency.service';
import { SenderService } from './sender.service';

@Module({
  providers: [OutboundIdempotencyService, SenderService],
  exports: [OutboundIdempotencyService, SenderService],
})
export class SenderModule {}
