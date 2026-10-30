import { BadGatewayException, Injectable } from '@nestjs/common';
import { AiGateway, parseJsonReply } from '@all-in-one/api/ai';
import type { PlannerTask } from '@all-in-one/applets/planner/contracts';
import { TasksService } from './tasks.service';

const SUBTASK_INSTRUCTIONS = `Break the user's task into 3 to 8 small, concrete checklist steps, in the same language as the task (usually Persian), each under 80 characters, in a sensible order. Skip steps already in the existing checklist.
Reply with JSON only: {"steps": ["…", "…"]}`;

/** AI help for tasks, on the user's own chat service. */
@Injectable()
export class PlannerAiService {
  constructor(
    private readonly gateway: AiGateway,
    private readonly tasks: TasksService,
  ) {}

  /** Adds AI-suggested checklist items to a task (up to the 100-item limit). */
  async subtasks(userId: string, taskId: string): Promise<PlannerTask> {
    const task = await this.tasks.get(userId, taskId);
    const reply = await this.gateway.text(
      userId,
      [
        { role: 'system', content: SUBTASK_INSTRUCTIONS },
        {
          role: 'user',
          content: JSON.stringify({
            task: task.title,
            notes: task.content.slice(0, 2000),
            existing: task.checklist.map((i) => i.title),
          }),
        },
      ],
      0.4,
      45_000,
    );
    const steps = parseJsonReply<{ steps?: unknown }>(reply)?.steps;
    const titles = Array.isArray(steps)
      ? steps
          .filter((t): t is string => typeof t === 'string' && !!t.trim())
          .map((t) => t.trim().slice(0, 200))
          .slice(0, Math.max(0, 100 - task.checklist.length))
          .slice(0, 8)
      : [];
    if (!titles.length)
      throw new BadGatewayException('پیشنهادی ساخته نشد. دوباره امتحان کن.');
    let updated = task;
    for (const title of titles)
      updated = await this.tasks.addItem(userId, taskId, title);
    return updated;
  }
}
