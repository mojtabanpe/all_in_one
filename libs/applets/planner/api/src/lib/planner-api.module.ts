import { Module } from '@nestjs/common';
import { PlannerController } from './planner.controller';
import { PlannerService } from './planner.service';

/** Planner applet backend. Needs PrismaModule and the global AuthGuard from the host app. */
@Module({
  controllers: [PlannerController],
  providers: [PlannerService],
})
export class PlannerApiModule {}
