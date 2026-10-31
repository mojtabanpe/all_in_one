import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@all-in-one/api/db';
import {
  PlannerAccess,
  RecurrencesService,
  TasksService,
  TickTickReconciliationService,
} from '@all-in-one/applets/planner/api';
import {
  addDays,
  isoDateIn,
  type PlannerTask,
} from '@all-in-one/applets/planner/contracts';
import { ToolKit } from '../mcp/mcp-tool-kit';
import { plannerTools, type PlannerServices } from './planner-tools';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';

const url = process.env['PLANNER_TEST_DATABASE_URL'];
if (
  url &&
  (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
    new URL(url).pathname !== '/aio_recurrence')
)
  throw new Error(
    'Integration tests require the isolated local aio_recurrence database',
  );

describe.skipIf(!url)(
  'recurring tasks through MCP, native services and PostgreSQL',
  () => {
    let prisma: PrismaService,
      tasks: TasksService,
      access: PlannerAccess,
      reconciliation: TickTickReconciliationService;
    let user: string, other: string, list: string;
    const today = isoDateIn(new Date());
    type Handler = (
      a: unknown,
    ) => Promise<{ isError?: boolean; content: { text: string }[] }>;
    const tools = new Map<string, { run: Handler; schema: z.ZodType }>();
    async function call<T = PlannerTask>(
      name: string,
      args: unknown,
    ): Promise<T> {
      const tool = tools.get(name)!;
      const result = await tool.run(tool.schema.parse(args));
      if (result.isError) throw new Error(result.content[0].text);
      return JSON.parse(result.content[0].text);
    }
    beforeAll(async () => {
      prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
      const recurrence = new RecurrencesService(prisma);
      access = new PlannerAccess(prisma, recurrence);
      tasks = new TasksService(prisma, access, recurrence);
      reconciliation = new TickTickReconciliationService(
        prisma,
        access,
        recurrence,
      );
      user = (
        await prisma.user.create({
          data: {
            email: `recurrence-${randomUUID()}@example.invalid`,
            passwordHash: 'test',
          },
        })
      ).id;
      other = (
        await prisma.user.create({
          data: {
            email: `other-${randomUUID()}@example.invalid`,
            passwordHash: 'test',
          },
        })
      ).id;
      list = (await access.inbox(user)).id;
      const server = {
        registerTool: (
          name: string,
          config: { inputSchema: z.ZodType | z.ZodRawShape },
          run: Handler,
        ) =>
          tools.set(name, {
            schema:
              config.inputSchema instanceof z.ZodType
                ? config.inputSchema
                : z.object(config.inputSchema),
            run,
          }),
      } as unknown as McpServer;
      const kit = new ToolKit(server, {
        token: 'test',
        clientId: 'local',
        scopes: ['planner:read', 'planner:write'],
        extra: { userId: user },
      });
      plannerTools(kit, { tasks, reconciliation } as PlannerServices);
    });
    afterAll(async () => {
      if (prisma) {
        await prisma.plannerTask.deleteMany({
          where: { userId: { in: [user, other] }, seriesId: { not: null } },
        });
        await prisma.user.deleteMany({ where: { id: { in: [user, other] } } });
        await prisma.$disconnect();
      }
    });
    it('creates, reads, completes and retains the next occurrence through actual MCP handlers', async () => {
      const root = await call('create_task', {
        title: 'Reading',
        date: today,
        time: '10:00',
        duration_min: 15,
        repeat_rule: 'RRULE:FREQ=DAILY',
        recurrence_timezone: 'Asia/Tehran',
        list_id: list,
        priority: 'HIGH',
        tags: ['study'],
        content: 'Native recurring task',
        checklist: [{ title: 'Read one chapter' }],
        idempotency_key: 'reading',
      });
      expect(root.isSeries).toBe(true);
      expect(root.durationMin).toBe(15);
      const rows = await call<PlannerTask[]>(
        'list_undone_tasks_by_time_query',
        { query_command: 'today' },
      );
      const occurrence = rows.find((t) => t.seriesId === root.id)!;
      expect(occurrence.time).toBe('10:00');
      expect(occurrence.tags).toEqual(['study']);
      expect(
        await prisma.plannerTask.count({ where: { seriesId: root.id } }),
      ).toBe(0);
      const read = await call('get_task', { task_id: occurrence.id });
      expect(read.id).toBe(occurrence.id);
      expect(read.checklist[0].id).toBe(occurrence.checklist[0].id);
      const complete = await call('complete_task', { task_id: occurrence.id });
      expect(complete.done).toBe(true);
      const retry = await call('complete_task', { task_id: occurrence.id });
      expect(retry.completedAt).toBe(complete.completedAt);
      const history = await tasks.filter(user, {
        completedFrom: today,
        completedTo: today,
      });
      expect(history.some((t) => t.id === occurrence.id)).toBe(true);
      const tomorrow = await tasks.filter(user, { preset: 'tomorrow' });
      expect(tomorrow.find((t) => t.seriesId === root.id)?.time).toBe('10:00');
      const calendar = await tasks.filter(user, {
        from: today,
        to: addDays(today, 7),
        status: 'all',
      });
      expect(calendar.filter((t) => t.seriesId === root.id)).toHaveLength(8);
      expect(new Set(calendar.map((t) => t.id)).size).toBe(calendar.length);
      expect(
        (await tasks.filter(user, { preset: 'today' })).some(
          (t) => t.id === occurrence.id,
        ),
      ).toBe(false);
      expect(
        (await tasks.filter(user, { preset: 'next7day' })).filter(
          (t) => t.seriesId === root.id,
        ),
      ).toHaveLength(6);
    });
    it('exercises the MCP protocol over the SDK transport', async () => {
      const server = new McpServer({
        name: 'local-recurrence-test',
        version: '1',
      });
      const client = new Client({ name: 'local-test', version: '1' });
      const kit = new ToolKit(server, {
        token: 'test',
        clientId: 'local',
        scopes: ['planner:read', 'planner:write'],
        extra: { userId: user },
      });
      plannerTools(kit, { tasks, reconciliation } as PlannerServices);
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      try {
        const invoke = async <T>(
          name: string,
          args: Record<string, unknown>,
        ): Promise<T> => {
          const result = await client.callTool({ name, arguments: args });
          expect(result.isError).not.toBe(true);
          const text = (
            result.content as { type: string; text: string }[]
          ).find((c) => c.type === 'text')?.text;
          return JSON.parse(text ?? 'null');
        };
        const root = await invoke<PlannerTask>('create_task', {
          title: 'MCP transport',
          date: today,
          time: '10:00',
          repeat_rule: 'RRULE:FREQ=DAILY',
          idempotency_key: 'transport',
        });
        const handle = `${root.id}@${today}`;
        expect(
          (await invoke<PlannerTask>('get_task', { task_id: handle }))
            .repeatRule,
        ).toBe('RRULE:FREQ=DAILY');
        expect(
          (
            await invoke<PlannerTask[]>('list_undone_tasks_by_time_query', {
              query_command: 'today',
            })
          ).some((t) => t.id === handle),
        ).toBe(true);
        await invoke('complete_task', { task_id: handle });
        expect(
          (
            await invoke<PlannerTask[]>('list_undone_tasks_by_time_query', {
              query_command: 'tomorrow',
            })
          ).some((t) => t.seriesId === root.id),
        ).toBe(true);
        expect(
          (
            await invoke<PlannerTask[]>('list_completed_tasks_by_date', {
              start_date: today,
              end_date: today,
            })
          ).some((t) => t.id === handle),
        ).toBe(true);
        const listed = await client.listTools();
        expect(
          listed.tools.find((t) => t.name === 'create_task')?.inputSchema
            .properties,
        ).toHaveProperty('repeat_rule');
      } finally {
        await client.close();
        await server.close();
      }
    });
    it('retains moved exceptions, and purging one occurrence does not regenerate it', async () => {
      const root = await tasks.create(user, {
        title: 'Moved',
        date: today,
        repeatRule: 'FREQ=DAILY;COUNT=3',
      });
      const handle = `${root.id}@${today}`;
      await tasks.update(user, handle, { date: addDays(today, 1) });
      expect(
        (await tasks.filter(user, { preset: 'today' })).some(
          (t) => t.id === handle,
        ),
      ).toBe(false);
      expect(
        (await tasks.filter(user, { preset: 'tomorrow' })).filter(
          (t) => t.seriesId === root.id,
        ),
      ).toHaveLength(2);
      await tasks.trash(user, handle);
      await tasks.purge(user, handle);
      expect(
        (
          await tasks.filter(user, { from: today, to: addDays(today, 3) })
        ).filter((t) => t.seriesId === root.id),
      ).toHaveLength(2);
      await tasks.trash(user, root.id);
      await tasks.purge(user, root.id);
      expect(
        await prisma.plannerTask.count({ where: { seriesId: root.id } }),
      ).toBe(0);
    });
    it('makes retries of future splits idempotent and validates changes before splitting', async () => {
      const root = await tasks.create(user, {
        title: 'Split retry',
        date: today,
        repeatRule: 'FREQ=DAILY',
      });
      const handle = `${root.id}@${today}`;
      await expect(
        tasks.update(user, handle, {
          recurrenceScope: 'FUTURE',
          listId: randomUUID(),
        }),
      ).rejects.toThrow();
      expect((await tasks.get(user, root.id)).repeatRule).toBe(
        'RRULE:FREQ=DAILY',
      );
      const one = await tasks.update(user, handle, {
        recurrenceScope: 'FUTURE',
        title: 'New series',
      });
      const two = await tasks.update(user, handle, {
        recurrenceScope: 'FUTURE',
        title: 'New series',
      });
      expect(two.id).toBe(one.id);
    });
    it('creates native series from existing TickTick import aliases and retains historical completions', async () => {
      const input = {
        title: 'Alias import',
        date: today,
        time: '10:00',
        endTime: '10:15',
        timeZone: 'Asia/Tehran',
        recurrenceRule: 'RRULE:FREQ=DAILY',
        externalSourceId: 'legacy-alias-import',
        reminders: ['TRIGGER:-PT10M'],
        completedAt: new Date().toISOString(),
      };
      const roots = await Promise.all([
        tasks.create(user, input),
        tasks.create(user, input),
      ]);
      expect(roots[0].id).toBe(roots[1].id);
      expect(roots[0].isSeries).toBe(true);
      expect(roots[0].durationMin).toBe(15);
      const next = (await tasks.filter(user, { preset: 'tomorrow' })).find(
        (t) => t.seriesId === roots[0].id,
      )!;
      expect(next.time).toBe('10:00');
      expect(next.reminders).toEqual(['TRIGGER:-PT10M']);
      expect(next.endTime).toBe('10:15');
      await call('update_task', {
        task_id: roots[0].id,
        recurrence_rule: 'FREQ=WEEKLY;BYDAY=SA,WE',
        time_zone: 'Asia/Tehran',
        end_time: '10:30',
        recurrence_scope: 'SERIES',
      });
      const updated = await tasks.get(user, roots[0].id);
      expect(updated.repeatRule).toBe('RRULE:FREQ=WEEKLY;BYDAY=SA,WE');
      expect(updated.durationMin).toBe(30);
      expect(
        (await tasks.get(user, `${roots[0].id}@${today}`)).durationMin,
      ).toBe(15);
      expect(
        (
          await tasks.filter(user, { completedFrom: today, completedTo: today })
        ).filter((t) => t.seriesId === roots[0].id),
      ).toHaveLength(1);
    });
    it('reconciles an existing metadata-only import by its already stored stable source ID without creating a duplicate', async () => {
      const legacy = await prisma.plannerTask.create({
        data: {
          userId: user,
          listId: list,
          title: 'Prior imported Writing',
          date: new Date(today + 'T00:00:00Z'),
          time: '12:30',
          endTime: '12:45',
          externalSourceId: 'existing-ticktick-source',
          recurrenceRule: 'RRULE:FREQ=DAILY',
          timeZone: 'Asia/Tehran',
          reminders: ['TRIGGER:-PT5M'],
        },
      });
      expect((await tasks.get(user, legacy.id)).recurrenceNeedsReview).toBe(
        true,
      );
      const input = {
        tasks: [
          {
            id: 'existing-ticktick-source',
            startDate: today + 'T12:30:00+0330',
            dueDate: today + 'T12:45:00+0330',
            timeZone: 'Asia/Tehran',
            repeatFlag: 'RRULE:FREQ=DAILY',
          },
        ],
      };
      const count = await prisma.plannerTask.count({ where: { userId: user } });
      const preview = await reconciliation.preview(user, input);
      expect(preview.changes[0].taskId).toBe(legacy.id);
      expect(
        (
          await prisma.plannerTask.findUniqueOrThrow({
            where: { id: legacy.id },
          })
        ).isSeries,
      ).toBe(false);
      await reconciliation.apply(user, input, preview.digest);
      expect(await prisma.plannerTask.count({ where: { userId: user } })).toBe(
        count,
      );
      expect(
        (await tasks.filter(user, { preset: 'today' })).find(
          (t) => t.seriesId === legacy.id,
        )?.time,
      ).toBe('12:30');
      const second = await reconciliation.preview(user, input);
      expect(
        (await reconciliation.apply(user, input, second.digest)).unchanged,
      ).toBe(1);
      expect((await tasks.get(user, legacy.id)).reminders).toEqual([
        'TRIGGER:-PT5M',
      ]);
    });

    it('prevents concurrent creation and occurrence duplicates', async () => {
      const input = {
        title: 'Safe retry',
        date: today,
        repeatRule: 'FREQ=DAILY',
        idempotencyKey: 'retry',
      };
      const roots = await Promise.all([
        tasks.create(user, input),
        tasks.create(user, input),
      ]);
      expect(roots[0].id).toBe(roots[1].id);
      const handle = `${roots[0].id}@${today}`;
      const completions = await Promise.all([
        tasks.update(user, handle, { done: true }),
        tasks.update(user, handle, { done: true }),
      ]);
      expect(completions[0].id).toBe(completions[1].id);
      expect(
        await prisma.plannerTask.count({ where: { seriesId: roots[0].id } }),
      ).toBe(1);
    });
    it('keeps a completion-based series on its pending occurrence until completion and advances once', async () => {
      const root = await tasks.create(user, {
        title: 'After doing',
        date: addDays(today, -3),
        time: '12:00',
        repeatRule: 'FREQ=DAILY;INTERVAL=2;COUNT=3',
        repeatFrom: 'COMPLETION',
      });
      expect(
        (await tasks.filter(user, { preset: 'tomorrow' })).some(
          (t) => t.seriesId === root.id,
        ),
      ).toBe(false);
      const handle = `${root.id}@${addDays(today, -3)}`;
      await Promise.all([
        tasks.update(user, handle, { done: true }),
        tasks.update(user, handle, { done: true }),
      ]);
      const next = await tasks.filter(user, {
        from: addDays(today, 1),
        to: addDays(today, 4),
      });
      expect(
        next.filter((t) => t.seriesId === root.id).map((t) => t.date),
      ).toEqual([addDays(today, 2)]);
      expect(
        (await prisma.plannerTask.findUniqueOrThrow({ where: { id: root.id } }))
          .completionCount,
      ).toBe(1);
    });
    it('does not stall or reuse keys when a completion-based occurrence is completed early or skipped', async () => {
      const root = await tasks.create(user, {
        title: 'Early completion',
        date: addDays(today, 1),
        repeatRule: 'FREQ=DAILY;COUNT=3',
        repeatFrom: 'COMPLETION',
      });
      const first = `${root.id}@${addDays(today, 1)}`;
      await tasks.update(user, first, { done: true });
      const second = `${root.id}@${addDays(today, 2)}`;
      expect((await tasks.get(user, second)).done).toBe(false);
      await Promise.all([tasks.trash(user, second), tasks.trash(user, second)]);
      const third = `${root.id}@${addDays(today, 3)}`;
      expect((await tasks.get(user, third)).done).toBe(false);
      await expect(tasks.restore(user, second)).rejects.toThrow();
      await tasks.update(user, third, { done: true });
      expect(
        (await tasks.filter(user, { from: today, to: addDays(today, 7) })).some(
          (t) => t.seriesId === root.id,
        ),
      ).toBe(false);
    });

    it('edits one occurrence and then splits future edits while retaining completion history', async () => {
      const root = await tasks.create(user, {
        title: 'Series',
        date: today,
        time: '14:00',
        repeatRule: 'FREQ=DAILY;COUNT=5',
      });
      const key = `${root.id}@${today}`;
      await tasks.update(user, key, { title: 'Today only' });
      expect(
        (await tasks.filter(user, { preset: 'tomorrow' })).find(
          (t) => t.seriesId === root.id,
        )?.title,
      ).toBe('Series');
      await tasks.update(user, key, { done: true });
      const split = await tasks.update(
        user,
        `${root.id}@${addDays(today, 1)}`,
        { title: 'Future', recurrenceScope: 'FUTURE' },
      );
      expect(split.id).not.toBe(root.id);
      const range = await tasks.filter(user, {
        from: today,
        to: addDays(today, 8),
        status: 'all',
      });
      expect(range.filter((t) => t.seriesId === split.id)).toHaveLength(4);
      expect(range.find((t) => t.id === key)?.title).toBe('Today only');
      expect(range.find((t) => t.id === key)?.done).toBe(true);
      await call('update_task_recurrence', {
        task_id: split.id,
        repeat_rule: 'FREQ=WEEKLY;BYDAY=SA,WE',
        recurrence_scope: 'SERIES',
      });
      expect((await tasks.get(user, split.id)).repeatRule).toBe(
        'RRULE:FREQ=WEEKLY;BYDAY=SA,WE',
      );
    });
    it('keeps monthly and yearly occurrences consistent in calendar and list queries', async () => {
      const month = await tasks.create(user, {
        title: 'Month end',
        date: '2026-01-31',
        time: '09:00',
        repeatRule: 'FREQ=MONTHLY',
      });
      const year = await tasks.create(user, {
        title: 'Yearly',
        date: '2024-02-29',
        time: '18:00',
        repeatRule: 'FREQ=YEARLY',
      });
      expect(
        (
          await tasks.filter(user, {
            from: '2026-02-01',
            to: '2026-03-31',
            status: 'all',
            listIds: [list],
          })
        )
          .filter((t) => t.seriesId === month.id)
          .map((t) => t.date),
      ).toEqual(['2026-03-31']);
      expect(
        (
          await tasks.filter(user, {
            from: '2028-02-01',
            to: '2028-03-01',
            status: 'all',
          })
        )
          .filter((t) => t.seriesId === year.id)
          .map((t) => t.date),
      ).toEqual(['2028-02-29']);
    });
    it('keeps completed history when the entire series is edited and updates pending snapshots', async () => {
      const root = await tasks.create(user, {
        title: 'Before edit',
        date: today,
        repeatRule: 'FREQ=DAILY',
        tags: ['before'],
      });
      const tomorrow = `${root.id}@${addDays(today, 1)}`;
      await tasks.update(user, tomorrow, { content: 'A pending exception' });
      await tasks.update(user, `${root.id}@${today}`, { done: true });
      await tasks.update(user, tomorrow, {
        recurrenceScope: 'SERIES',
        title: 'After edit',
        tags: ['after'],
      });
      expect((await tasks.get(user, `${root.id}@${today}`)).title).toBe(
        'Before edit',
      );
      expect((await tasks.get(user, tomorrow)).title).toBe('After edit');
      expect((await tasks.get(user, tomorrow)).tags).toEqual(['after']);
    });
    it('converts a completed imported task without losing its history or stalling completion-based recurrence', async () => {
      const old = await tasks.create(user, {
        title: 'Old completed import',
        date: today,
      });
      await tasks.update(user, old.id, { done: true });
      const input = {
        tasks: [
          {
            id: 'completed-source',
            existingTaskId: old.id,
            startDate: today + 'T10:00:00+0330',
            repeatFlag: 'FREQ=DAILY;COUNT=3',
            repeatFrom: '1' as const,
          },
        ],
      };
      const preview = await reconciliation.preview(user, input);
      await reconciliation.apply(user, input, preview.digest);
      expect(
        (await tasks.filter(user, { preset: 'tomorrow' })).some(
          (t) => t.seriesId === old.id,
        ),
      ).toBe(true);
      expect(
        (
          await tasks.filter(user, { completedFrom: today, completedTo: today })
        ).some((t) => t.seriesId === old.id),
      ).toBe(true);
    });
    it('requires a future split to change recurrence basis after history exists', async () => {
      const root = await tasks.create(user, {
        title: 'Basis change',
        date: today,
        repeatRule: 'FREQ=DAILY',
      });
      await tasks.update(user, `${root.id}@${today}`, { done: true });
      await expect(
        tasks.update(user, root.id, {
          repeatFrom: 'COMPLETION',
          recurrenceScope: 'SERIES',
        }),
      ).rejects.toThrow();
      const next = await tasks.update(user, `${root.id}@${addDays(today, 1)}`, {
        repeatFrom: 'COMPLETION',
        recurrenceScope: 'FUTURE',
      });
      expect(next.repeatFrom).toBe('COMPLETION');
      expect((await tasks.get(user, `${root.id}@${today}`)).done).toBe(true);
    });

    it('batch creation/update/complete use the same recurrence path', async () => {
      const roots = await call<PlannerTask[]>('batch_create_tasks', {
        tasks: [
          { title: 'Batch1', date: today, repeat_rule: 'FREQ=DAILY' },
          { title: 'Batch2', date: today, repeat_rule: 'FREQ=WEEKLY' },
        ],
      });
      await call('batch_update_tasks', {
        tasks: roots.map((t) => ({
          task_id: t.id,
          priority: 'LOW',
          recurrence_scope: 'SERIES',
        })),
      });
      const handles = roots.map((t) => `${t.id}@${today}`);
      expect(
        await call('complete_tasks_in_list', {
          list_id: list,
          task_ids: handles,
        }),
      ).toEqual({ completed: 2 });
      for (const root of roots)
        expect(
          (
            await tasks.filter(user, { from: today, to: addDays(today, 7) })
          ).some((t) => t.seriesId === root.id),
        ).toBe(true);
    });
    it('authorizes a moved occurrence by its own list, without granting access to the series', async () => {
      const destination = await prisma.plannerList.create({
        data: {
          ownerId: other,
          name: 'Shared destination',
          members: {
            create: [
              { userId: other, role: 'OWNER' },
              { userId: user, role: 'EDITOR' },
            ],
          },
        },
      });
      const root = await tasks.create(user, {
        title: 'One move',
        date: today,
        repeatRule: 'FREQ=DAILY',
      });
      const handle = `${root.id}@${today}`;
      await tasks.update(user, handle, { listId: destination.id });
      await prisma.plannerListMember.delete({
        where: { listId_userId: { listId: destination.id, userId: user } },
      });
      expect((await tasks.get(other, handle)).listId).toBe(destination.id);
      await expect(tasks.get(user, handle)).rejects.toThrow();
      await expect(
        tasks.update(other, handle, {
          recurrenceScope: 'SERIES',
          title: 'Forbidden',
        }),
      ).rejects.toThrow();
      expect((await tasks.update(other, handle, { done: true })).done).toBe(
        true,
      );
      await expect(
        tasks.get(other, `${root.id}@${addDays(today, 1)}`),
      ).rejects.toThrow();
    });

    it('supports one-off tasks, rejects cross-user access and invalid occurrence handles', async () => {
      const task = await tasks.create(user, { title: 'One off', date: today });
      expect(task.repeatRule).toBeNull();
      expect(task.isSeries).toBe(false);
      expect((await tasks.update(user, task.id, { done: true })).done).toBe(
        true,
      );
      await expect(tasks.get(other, task.id)).rejects.toThrow();
      const root = await tasks.create(user, {
        title: 'Private',
        date: today,
        repeatRule: 'FREQ=WEEKLY;BYDAY=SA',
      });
      await expect(tasks.get(other, `${root.id}@${today}`)).rejects.toThrow();
      await expect(tasks.get(user, `${root.id}@2026-02-31`)).rejects.toThrow();
    });
    it('previews existing TickTick tasks, applies only approved unchanged plans, and is idempotent', async () => {
      const original = await tasks.create(user, {
        title: 'Imported Listening',
        date: today,
        content: 'Keep notes',
        tags: ['imported'],
        priority: 'HIGH',
      });
      const input = {
        tasks: [
          {
            id: 'ticktick-listening',
            existingTaskId: original.id,
            startDate: '2026-10-30T10:15:00+0330',
            dueDate: '2026-10-30T10:30:00+0330',
            repeatFlag: 'RRULE:FREQ=DAILY',
            repeatFrom: '0' as const,
            timeZone: 'Asia/Tehran',
          },
        ],
      };
      const count = await prisma.plannerTask.count({ where: { userId: user } });
      const preview = await reconciliation.preview(user, input);
      expect(preview.creates).toBe(0);
      expect((await tasks.get(user, original.id)).repeatRule).toBeNull();
      await expect(
        reconciliation.apply(user, input, '0'.repeat(64)),
      ).rejects.toThrow();
      expect(
        (await reconciliation.apply(user, input, preview.digest)).updated,
      ).toBe(1);
      const second = await reconciliation.preview(user, input);
      expect(
        (await reconciliation.apply(user, input, second.digest)).unchanged,
      ).toBe(1);
      expect(await prisma.plannerTask.count({ where: { userId: user } })).toBe(
        count,
      );
      const after = await tasks.get(user, original.id);
      expect(after.content).toBe('Keep notes');
      expect(after.tags).toEqual(['imported']);
      expect(after.priority).toBe('HIGH');
      expect(after.durationMin).toBe(15);
      const todayRows = await tasks.filter(user, { preset: 'today' });
      expect(
        todayRows.some((t) => t.seriesId === original.id && t.time === '10:15'),
      ).toBe(true);
      await expect(
        reconciliation.preview(user, {
          tasks: [
            { ...input.tasks[0], id: 'unmapped', existingTaskId: undefined },
          ],
        }),
      ).rejects.toThrow();
    });
  },
  30000,
);
