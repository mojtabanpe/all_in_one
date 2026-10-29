import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/** Health applet backend (fitness + nutrition). Needs PrismaModule and the global AuthGuard from the host app. */
@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthApiModule {}
