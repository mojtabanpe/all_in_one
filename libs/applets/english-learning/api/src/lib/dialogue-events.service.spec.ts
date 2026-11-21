import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@all-in-one/api/db';
import { DIALOGUE_LIBRARY } from '@all-in-one/applets/english-learning/contracts';
import { DialogueEventsService } from './dialogue-events.service';

function setup() {
  const prisma = {
    englishDialogueEvent: {
      create: vi.fn(async () => ({})),
      groupBy: vi.fn(),
    },
  };
  return {
    prisma,
    service: new DialogueEventsService(prisma as unknown as PrismaService),
  };
}

describe('DialogueEventsService', () => {
  it('records events only for library dialogues, with a score only on FINISH', async () => {
    const { service, prisma } = setup();
    await expect(
      service.record('u1', 'no-such-dialogue', { kind: 'OPEN' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await service.record('u1', 'a1-cafe', { kind: 'OPEN', score: 90 });
    await service.record('u1', 'a1-cafe', { kind: 'FINISH', score: 72 });
    expect(prisma.englishDialogueEvent.create).toHaveBeenNthCalledWith(1, {
      data: { userId: 'u1', slug: 'a1-cafe', kind: 'OPEN', score: null },
    });
    expect(prisma.englishDialogueEvent.create).toHaveBeenNthCalledWith(2, {
      data: { userId: 'u1', slug: 'a1-cafe', kind: 'FINISH', score: 72 },
    });
  });

  it('reports every dialogue, most opened first, excluding staff', async () => {
    const { service, prisma } = setup();
    prisma.englishDialogueEvent.groupBy
      .mockResolvedValueOnce([
        {
          slug: 'a2-doctor',
          kind: 'OPEN',
          _count: { _all: 5 },
          _avg: { score: null },
        },
        {
          slug: 'a2-doctor',
          kind: 'FINISH',
          _count: { _all: 2 },
          _avg: { score: 81.4 },
        },
        {
          slug: 'a1-cafe',
          kind: 'OPEN',
          _count: { _all: 1 },
          _avg: { score: null },
        },
      ])
      .mockResolvedValueOnce([
        { slug: 'a2-doctor', userId: 'u1' },
        { slug: 'a2-doctor', userId: 'u2' },
        { slug: 'a1-cafe', userId: 'u1' },
      ])
      .mockResolvedValueOnce([{ slug: 'a2-doctor', _count: { _all: 3 } }]);
    const rows = await service.usage(new Date('2026-11-21T12:00:00Z'));
    expect(rows).toHaveLength(DIALOGUE_LIBRARY.length);
    expect(rows[0]).toMatchObject({
      slug: 'a2-doctor',
      opens: 5,
      users: 2,
      finishes: 2,
      avgScore: 81,
      opens7d: 3,
    });
    expect(rows[1]).toMatchObject({
      slug: 'a1-cafe',
      opens: 1,
      finishes: 0,
      avgScore: null,
    });
    for (const call of prisma.englishDialogueEvent.groupBy.mock.calls)
      expect(call[0].where.user).toEqual({ role: { not: 'ADMIN' } });
  });
});
