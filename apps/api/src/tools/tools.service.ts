import { PushService } from '../push/push.service';
import { Injectable } from '@nestjs/common';
import {
  CardsService,
  DecksService,
  TextsService,
} from '@all-in-one/applets/english-learning/api';
import {
  BodyService,
  HealthAiService,
  HealthService,
  TrainingService,
} from '@all-in-one/applets/health/api';
import {
  CalendarsService,
  CountdownsService,
  FocusService,
  HabitsService,
  ListsService,
  TagsService,
  TasksService,
  TickTickReconciliationService,
} from '@all-in-one/applets/planner/api';
import { englishTools } from './english-tools';
import { healthBodyTools } from './health-body-tools';
import { healthCoachTools } from './health-coach-tools';
import { healthTools } from './health-tools';
import { plannerTools } from './planner-tools';
import type { ToolSink } from './tool-kit';

/**
 * Every applet's tools, defined once for both the ChatGPT connection (MCP)
 * and the in-app assistant. A new applet capability gets a tool here.
 */
@Injectable()
export class ToolsService {
  constructor(
    private readonly push: PushService,
    private readonly decks: DecksService,
    private readonly cards: CardsService,
    private readonly texts: TextsService,
    private readonly lists: ListsService,
    private readonly tasks: TasksService,
    private readonly reconciliation: TickTickReconciliationService,
    private readonly tags: TagsService,
    private readonly habits: HabitsService,
    private readonly focus: FocusService,
    private readonly calendars: CalendarsService,
    private readonly countdowns: CountdownsService,
    private readonly health: HealthService,
    private readonly training: TrainingService,
    private readonly healthAi: HealthAiService,
    private readonly body: BodyService,
  ) {}

  register(sink: ToolSink): void {
    sink.tool(
      'push_status',
      {
        description:
          'Check whether the server supports PWA push notifications. Enabling device permission must be done by the user in account settings.',
        scope: 'planner:read',
        kind: 'read',
        input: {},
      },
      async () => ({ enabled: this.push.status().enabled }),
    );
    sink.tool(
      'push_test',
      {
        description:
          'Send a fixed test notification to this user’s subscribed devices. Only use when the user requests a test notification.',
        scope: 'planner:write',
        kind: 'create',
        input: {},
      },
      async () => this.push.testDevices(sink.user),
    );

    englishTools(sink, {
      decks: this.decks,
      cards: this.cards,
      texts: this.texts,
    });
    plannerTools(sink, {
      lists: this.lists,
      tasks: this.tasks,
      reconciliation: this.reconciliation,
      tags: this.tags,
      habits: this.habits,
      focus: this.focus,
      calendars: this.calendars,
      countdowns: this.countdowns,
    });
    healthCoachTools(sink, { health: this.health, training: this.training });
    healthTools(sink, { health: this.health, ai: this.healthAi });
    healthBodyTools(sink, { body: this.body });
  }
}
