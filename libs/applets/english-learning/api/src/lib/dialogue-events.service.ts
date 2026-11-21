import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import {
  DIALOGUE_LIBRARY,
  type DialogueEventInput,
  type DialogueUsage,
  libraryDialogue,
} from '@all-in-one/applets/english-learning/contracts';

const DAY_MS = 86_400_000;

/** Opens and finishes of the ready shadowing dialogues, and the admin report on them. */
@Injectable()
export class DialogueEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    userId: string,
    slug: string,
    input: DialogueEventInput,
  ): Promise<void> {
    if (!libraryDialogue(slug)) throw new NotFoundException();
    await this.prisma.englishDialogueEvent.create({
      data: {
        userId,
        slug,
        kind: input.kind,
        score: input.kind === 'FINISH' ? (input.score ?? null) : null,
      },
    });
  }

  /** One row per library dialogue, staff accounts excluded, most opened first. */
  async usage(now = new Date()): Promise<DialogueUsage[]> {
    const notStaff = { user: { role: { not: 'ADMIN' as const } } };
    const [byKind, users, recent] = await Promise.all([
      this.prisma.englishDialogueEvent.groupBy({
        by: ['slug', 'kind'],
        where: notStaff,
        _count: { _all: true },
        _avg: { score: true },
      }),
      this.prisma.englishDialogueEvent.groupBy({
        by: ['slug', 'userId'],
        where: { ...notStaff, kind: 'OPEN' },
      }),
      this.prisma.englishDialogueEvent.groupBy({
        by: ['slug'],
        where: {
          ...notStaff,
          kind: 'OPEN',
          createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) },
        },
        _count: { _all: true },
      }),
    ]);
    const rows = DIALOGUE_LIBRARY.map((x): DialogueUsage => {
      const open = byKind.find((r) => r.slug === x.slug && r.kind === 'OPEN');
      const finish = byKind.find(
        (r) => r.slug === x.slug && r.kind === 'FINISH',
      );
      const avg = finish?._avg.score;
      return {
        slug: x.slug,
        level: x.level,
        title: x.title,
        opens: open?._count._all ?? 0,
        users: users.filter((u) => u.slug === x.slug).length,
        finishes: finish?._count._all ?? 0,
        avgScore: avg == null ? null : Math.round(avg),
        opens7d: recent.find((r) => r.slug === x.slug)?._count._all ?? 0,
      };
    });
    return rows.sort(
      (a, b) => b.opens - a.opens || a.slug.localeCompare(b.slug),
    );
  }
}
