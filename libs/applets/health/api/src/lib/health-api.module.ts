import { TrainingService } from './training.service';
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthAiService } from './health-ai.service';
import { HealthService } from './health.service';

/** Health applet backend (fitness + nutrition). Needs PrismaModule, the global AuthGuard and AiModule from the host app. */
@Module({
  controllers: [HealthController],
  providers: [HealthService, HealthAiService, TrainingService],
  exports: [HealthService, HealthAiService, TrainingService],
})
export class HealthApiModule {}
