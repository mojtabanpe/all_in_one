import { Injectable } from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import type {
  CreateShadowingSessionInput,
  ShadowingSession,
} from '@all-in-one/applets/english-learning/contracts';

/** Shadowing session scores (0–100, strict), kept for the progress chart. */
@Injectable()
export class ShadowingService {
  constructor(private readonly prisma: PrismaService) {}

  async save(
    userId: string,
    input: CreateShadowingSessionInput,
  ): Promise<ShadowingSession> {
    const row = await this.prisma.englishShadowingSession.create({
      data: {
        userId,
        title: input.title,
        score: input.score,
        sentences: input.sentences,
        attempted: Math.min(input.attempted, input.sentences),
      },
    });
    return present(row);
  }

  /** Oldest first, at most `limit` (latest ones). */
  async list(userId: string, limit = 200): Promise<ShadowingSession[]> {
    const rows = await this.prisma.englishShadowingSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
    return rows.reverse().map(present);
  }
}

function present(row: {
  id: string;
  title: string;
  score: number;
  sentences: number;
  attempted: number;
  createdAt: Date;
}): ShadowingSession {
  return {
    id: row.id,
    title: row.title,
    score: row.score,
    sentences: row.sentences,
    attempted: row.attempted,
    createdAt: row.createdAt.toISOString(),
  };
}
