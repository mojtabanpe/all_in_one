import { Injectable } from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import type {
  CreatePracticeScoreInput,
  PracticeKind,
  PracticeScore,
} from '@all-in-one/applets/english-learning/contracts';

/** Practice scores (0–100, strict) for shadowing, writing, speaking and listening. */
@Injectable()
export class PracticeScoresService {
  constructor(private readonly prisma: PrismaService) {}

  async save(
    userId: string,
    input: CreatePracticeScoreInput,
  ): Promise<PracticeScore> {
    const row = await this.prisma.englishPracticeScore.create({
      data: {
        userId,
        kind: input.kind,
        title: input.title,
        score: input.score,
        items: input.items,
        attempted: Math.min(input.attempted, input.items),
        mistakes: input.mistakes ?? null,
      },
    });
    return present(row);
  }

  /** Oldest first, the latest `limit`; all kinds unless one is given. */
  async list(
    userId: string,
    kind?: PracticeKind,
    limit = 200,
  ): Promise<PracticeScore[]> {
    const rows = await this.prisma.englishPracticeScore.findMany({
      where: { userId, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
    return rows.reverse().map(present);
  }
}

function present(row: {
  id: string;
  kind: PracticeKind;
  title: string;
  score: number;
  items: number;
  attempted: number;
  mistakes: number | null;
  createdAt: Date;
}): PracticeScore {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    score: row.score,
    items: row.items,
    attempted: row.attempted,
    mistakes: row.mistakes,
    createdAt: row.createdAt.toISOString(),
  };
}
