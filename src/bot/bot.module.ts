import { Module } from '@nestjs/common';

import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';

@Module({
  imports: [WhatsappModule],
  controllers: [BotController],
  providers: [BotService],
})
export class BotModule {}
