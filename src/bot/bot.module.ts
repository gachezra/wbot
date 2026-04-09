import { Module } from '@nestjs/common';

import { AgentModule } from '../agent/agent.module';
import { ContextModule } from '../context/context.module';
import { MemoryModule } from '../memory/memory.module';
import { SenderModule } from '../sender/sender.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';

@Module({
  imports: [WhatsappModule, SenderModule, MemoryModule, ContextModule, AgentModule],
  controllers: [BotController],
  providers: [BotService],
})
export class BotModule {}
