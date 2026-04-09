import { Module } from '@nestjs/common';

import { MemoryModule } from '../memory/memory.module';
import { ContextBuilderService } from './context-builder.service';

@Module({
  imports: [MemoryModule],
  providers: [ContextBuilderService],
  exports: [ContextBuilderService],
})
export class ContextModule {}
