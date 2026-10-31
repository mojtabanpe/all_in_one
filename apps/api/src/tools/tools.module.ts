import { PushModule } from '../push/push.module';
import { Module } from '@nestjs/common';
import { EnglishApiModule } from '@all-in-one/applets/english-learning/api';
import { HealthApiModule } from '@all-in-one/applets/health/api';
import { PlannerApiModule } from '@all-in-one/applets/planner/api';
import { ToolsService } from './tools.service';

@Module({
  imports: [EnglishApiModule, PlannerApiModule, HealthApiModule, PushModule],
  providers: [ToolsService],
  exports: [ToolsService],
})
export class ToolsModule {}
