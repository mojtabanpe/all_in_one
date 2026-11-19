import { Module } from '@nestjs/common';
import { PlannerApiModule } from '@all-in-one/applets/planner/api';
import { AssistantModule } from '../assistant/assistant.module';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

/** Telegram bot: account link, morning summary and logging by message (directive 168). */
@Module({
  imports: [AssistantModule, PlannerApiModule],
  providers: [TelegramService],
  controllers: [TelegramController],
  exports: [TelegramService],
})
export class TelegramModule {}
