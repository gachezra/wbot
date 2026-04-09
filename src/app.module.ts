import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { BotModule } from './bot/bot.module';
import { HealthModule } from './health/health.module';
import { SharedModule } from './shared/shared.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    SharedModule,
    HealthModule,
    WhatsappModule,
    BotModule,
  ],
})
export class AppModule {}
