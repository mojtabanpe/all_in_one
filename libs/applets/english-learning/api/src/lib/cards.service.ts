import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import {
  type Card,
  type CreateCardInput,
  isLeech,
  type Rating,
  schedule,
  type UpdateCardInput,
} from '@all-in-one/applets/english-learning/contracts';
import { toIsoDate } from '@all-in-one/shared/schemas';
import { DecksService, toCard } from './decks.service';

/** Owner-scoped cards and transactional review scheduling (Recall `cards`). */
@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly decks: DecksService,
  ) {}

  async get(userId: string, id: string): Promise<Card> {
    const card = await this.prisma.englishCard.findFirst({
      where: { id, userId },
    });
    if (!card) throw new NotFoundException('این کارت پیدا نشد.');
    return toCard(card);
  }

  async list(userId: string, deckId: string, dueOnly: boolean): Promise<Card[]> {
    await this.decks.get(userId, deckId);
    const cards = await this.prisma.englishCard.findMany({
      where: dueOnly
        ? { userId, deckId, suspended: false, dueAt: { lte: new Date() } }
        : { userId, deckId },
      orderBy: dueOnly
        ? [{ dueAt: 'asc' }, { id: 'asc' }]
        : [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return cards.map(toCard);
  }

  /** Case-insensitive substring search over front, back, examples and unit. */
  async search(
    userId: string,
    query: string,
    deckId?: string,
    limit = 50,
    offset = 0,
  ): Promise<Card[]> {
    if (deckId) await this.decks.get(userId, deckId);
    const cards = await this.prisma.englishCard.findMany({
      where: {
        userId,
        ...(deckId ? { deckId } : {}),
        OR: (['front', 'back', 'examples', 'unit'] as const).map((field) => ({
          [field]: { contains: query, mode: 'insensitive' as const },
        })),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      skip: offset,
    });
    return cards.map(toCard);
  }

  async create(userId: string, input: CreateCardInput): Promise<Card> {
    await this.decks.get(userId, input.deckId);
    return toCard(
      await this.prisma.englishCard.create({
        data: {
          userId,
          deckId: input.deckId,
          front: input.front,
          back: input.back,
          unit: input.unit?.toLowerCase() ?? '',
          examples: input.examples ?? '',
        },
      }),
    );
  }

  async update(
    userId: string,
    id: string,
    patch: UpdateCardInput,
  ): Promise<Card> {
    await this.get(userId, id);
    return toCard(
      await this.prisma.englishCard.update({
        where: { id },
        data: { ...patch, unit: patch.unit?.toLowerCase() },
      }),
    );
  }

  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    await this.get(userId, id);
    await this.prisma.englishCard.delete({ where: { id } });
    return { deleted: true };
  }

  async move(userId: string, id: string, deckId: string): Promise<Card> {
    await this.get(userId, id);
    await this.decks.get(userId, deckId);
    return toCard(
      await this.prisma.englishCard.update({ where: { id }, data: { deckId } }),
    );
  }

  async suspend(userId: string, id: string): Promise<Card> {
    await this.get(userId, id);
    return toCard(
      await this.prisma.englishCard.update({
        where: { id },
        data: { suspended: true },
      }),
    );
  }

  /** Back into rotation with a clean lapse count. */
  async unsuspend(userId: string, id: string): Promise<Card> {
    await this.get(userId, id);
    return toCard(
      await this.prisma.englishCard.update({
        where: { id },
        data: { suspended: false, lapses: 0 },
      }),
    );
  }

  /**
   * Schedules the card from its persisted state under a row lock, so
   * concurrent reviews apply in order; a fresh leech is suspended. Counts the
   * review for today's streak.
   */
  review(userId: string, id: string, rating: Rating): Promise<Card> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM english_cards
        WHERE id = ${id}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('این کارت پیدا نشد.');
      const card = toCard(
        await tx.englishCard.findUniqueOrThrow({ where: { id } }),
      );
      const next = schedule(card, rating);
      const suspended =
        card.suspended || (rating === 'again' && isLeech(next));
      const date = new Date(`${toIsoDate(new Date())}T00:00:00Z`);
      await tx.englishReviewDay.upsert({
        where: { userId_date: { userId, date } },
        create: { userId, date, reviews: 1 },
        update: { reviews: { increment: 1 } },
      });
      return toCard(
        await tx.englishCard.update({
          where: { id },
          data: {
            easeFactor: next.easeFactor,
            intervalDays: next.intervalDays,
            repetitions: next.repetitions,
            lapses: next.lapses,
            dueAt: new Date(next.dueAt),
            lastReviewedAt: next.lastReviewedAt
              ? new Date(next.lastReviewedAt)
              : null,
            suspended,
            suspensions:
              card.suspensions + (!card.suspended && suspended ? 1 : 0),
          },
        }),
      );
    });
  }
}
