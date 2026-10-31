import { createHash } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import {
  tickTickSchedule,
  type TickTickReconciliation,
} from '@all-in-one/applets/planner/contracts';
import { PlannerAccess } from './access.service';
import { RecurrencesService } from './recurrences.service';
import { TASK_INCLUDE } from './task-mapping';

@Injectable()
export class TickTickReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlannerAccess,
    private readonly recurrence: RecurrencesService,
  ) {}
  async preview(userId: string, input: TickTickReconciliation) {
    const changes = [];
    const seen = new Set<string>();
    const targets = new Set<string>();
    for (const source of input.tasks) {
      if (seen.has(source.id))
        throw new BadRequestException('Duplicate TickTick source ID');
      seen.add(source.id);
      const bound = await this.prisma.plannerTask.findUnique({
        where: {
          userId_sourceProvider_sourceId: {
            userId,
            sourceProvider: 'ticktick',
            sourceId: source.id,
          },
        },
      });
      const legacy =
        source.id.length <= 120
          ? await this.prisma.plannerTask.findUnique({
              where: {
                userId_externalSourceId: {
                  userId,
                  externalSourceId: source.id,
                },
              },
            })
          : null;
      if (
        legacy &&
        source.existingTaskId &&
        source.existingTaskId !== legacy.id
      )
        throw new BadRequestException(
          'Source is already bound to another imported task',
        );
      if (bound && source.existingTaskId && source.existingTaskId !== bound.id)
        throw new BadRequestException(
          'Source is already bound to another task',
        );
      const id = bound?.id ?? legacy?.id ?? source.existingTaskId;
      if (!id)
        throw new BadRequestException(
          `Map TickTick ${source.id} to an existing native task ID first. No task will be created.`,
        );
      const task = await this.access.task(userId, id);
      if (task.userId !== userId || task.seriesId || task.deletedAt)
        throw new BadRequestException(
          'Reconcile only your own active task or series template',
        );
      if (targets.has(id))
        throw new BadRequestException('Two source IDs map to the same task');
      targets.add(id);
      if (
        task.sourceId &&
        (task.sourceId !== source.id || task.sourceProvider !== 'ticktick')
      )
        throw new BadRequestException('Task belongs to another import source');
      let schedule;
      try {
        schedule = tickTickSchedule(source);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      if (
        task.isSeries &&
        task.repeatFrom !== schedule.repeatFrom &&
        (await this.prisma.plannerTask.count({ where: { seriesId: task.id } }))
      )
        throw new BadRequestException(
          'Change recurrence basis with a native FUTURE edit before reconciling a series with history',
        );
      const before = {
        date: task.date?.toISOString().slice(0, 10) ?? null,
        time: task.time,
        durationMin: task.durationMin,
        repeatRule: task.repeatRule,
        repeatFrom: task.repeatFrom,
        recurrenceTimezone: task.recurrenceTimezone,
      };
      changes.push({
        taskId: id,
        title: task.title,
        legacy: {
          externalSourceId: task.externalSourceId,
          recurrenceRule: task.recurrenceRule,
          timeZone: task.timeZone,
          endTime: task.endTime,
        },
        sourceId: source.id,
        expectedUpdatedAt: task.updatedAt.toISOString(),
        before,
        after: schedule,
        action:
          JSON.stringify(before) === JSON.stringify(schedule) && bound
            ? 'unchanged'
            : 'update',
      });
    }
    const digest = createHash('sha256')
      .update(JSON.stringify({ userId, changes }))
      .digest('hex');
    return { digest, changes, creates: 0 };
  }
  async apply(
    userId: string,
    input: TickTickReconciliation,
    approvedDigest: string,
  ) {
    const preview = await this.preview(userId, input);
    if (preview.digest !== approvedDigest)
      throw new BadRequestException(
        'Preview changed or approval digest is stale; review a fresh preview',
      );
    await this.prisma.$transaction(async (tx) => {
      for (const change of preview.changes) {
        if (change.action === 'unchanged') continue;
        const task = await tx.plannerTask.findUniqueOrThrow({
          where: { id: change.taskId },
          include: TASK_INCLUDE,
        });
        if (task.updatedAt.toISOString() !== change.expectedUpdatedAt)
          throw new BadRequestException('Task changed since preview');
        const data = change.after;
        // Completion history of an imported one-off is retained as the first occurrence snapshot.
        if (!task.isSeries && task.status === 'DONE')
          await tx.plannerTask.create({
            data: this.recurrence.snapshot(
              { ...task, repeatRule: data.repeatRule },
              task.id,
              data.date,
            ),
          });
        const completionState =
          !task.isSeries &&
          task.status === 'DONE' &&
          data.repeatFrom === 'COMPLETION'
            ? this.recurrence.initialCompletion(
                task.completedAt ?? new Date(),
                data.repeatRule,
                data.time,
                data.recurrenceTimezone,
                task.recurrenceEnd?.toISOString().slice(0, 10) ?? null,
                data.date,
              )
            : {};
        const result = await tx.plannerTask.updateMany({
          where: { id: task.id, updatedAt: task.updatedAt },
          data: {
            ...data,
            recurrenceRule:
              data.repeatRule.length <= 500 ? data.repeatRule : null,
            timeZone:
              data.recurrenceTimezone.length <= 80
                ? data.recurrenceTimezone
                : null,
            ...completionState,
            date: new Date(`${data.date}T00:00:00Z`),
            isSeries: true,
            status: 'TODO',
            completedAt: null,
            sourceProvider: 'ticktick',
            sourceId: change.sourceId,
          },
        });
        if (result.count !== 1)
          throw new BadRequestException('Task changed during reconciliation');
      }
    });
    return {
      updated: preview.changes.filter((c) => c.action === 'update').length,
      unchanged: preview.changes.filter((c) => c.action === 'unchanged').length,
      created: 0,
    };
  }
}
