import { Injectable } from '@nestjs/common';
import {
  CardsService,
  DecksService,
  TextsService,
} from '@all-in-one/applets/english-learning/api';
import { HealthAiService, HealthService } from '@all-in-one/applets/health/api';
import {
  CalendarsService,
  CountdownsService,
  FocusService,
  HabitsService,
  ListsService,
  TagsService,
  TasksService,
} from '@all-in-one/applets/planner/api';
import { englishTools } from './english-tools';
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
    private readonly decks: DecksService,
    private readonly cards: CardsService,
    private readonly texts: TextsService,
    private readonly lists: ListsService,
    private readonly tasks: TasksService,
    private readonly tags: TagsService,
    private readonly habits: HabitsService,
    private readonly focus: FocusService,
    private readonly calendars: CalendarsService,
    private readonly countdowns: CountdownsService,
    private readonly health: HealthService,
    private readonly healthAi: HealthAiService,
  ) {}

  register(sink: ToolSink): void {
    englishTools(sink, {
      decks: this.decks,
      cards: this.cards,
      texts: this.texts,
    });
    plannerTools(sink, {
      lists: this.lists,
      tasks: this.tasks,
      tags: this.tags,
      habits: this.habits,
      focus: this.focus,
      calendars: this.calendars,
      countdowns: this.countdowns,
    });
    healthTools(sink, { health: this.health, ai: this.healthAi });
  }
}
