import { Module } from '@nestjs/common';
import { PlannerAccess } from './access.service';
import { CalendarsService } from './calendars.service';
import { CountdownsService, FocusService } from './focus.service';
import { HabitsService } from './habits.service';
import { ListsService } from './lists.service';
import {
  PlannerHabitsController,
  PlannerListsController,
  PlannerTasksController,
  PlannerTimeController,
} from './planner.controller';
import { TagsService } from './tags.service';
import { TasksService } from './tasks.service';

const SERVICES = [
  PlannerAccess,
  ListsService,
  TasksService,
  TagsService,
  HabitsService,
  FocusService,
  CountdownsService,
  CalendarsService,
];

/**
 * Planner applet backend (TickTick parity). Needs PrismaModule, ConfigModule
 * and the global AuthGuard from the host app. The services are exported for
 * the ChatGPT MCP tools.
 */
@Module({
  controllers: [
    PlannerListsController,
    PlannerTasksController,
    PlannerHabitsController,
    PlannerTimeController,
  ],
  providers: SERVICES,
  exports: SERVICES,
})
export class PlannerApiModule {}
