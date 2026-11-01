import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type EnglishCard as DbCard,
  type EnglishDeck as DbDeck,
  type EnglishText as DbText,
  PrismaService,
} from '@all-in-one/api/db';
import type {
  Card,
  CreateDeckInput,
  Deck,
  DeckColor,
  DeckWithStats,
  ReadingText,
  UpdateDeckInput,
} from '@all-in-one/applets/english-learning/contracts';
import { englishStarterCard, englishStarterDeck } from './starter-data';

export function toDeck(d: DbDeck): Deck {
  d = englishStarterDeck(d);
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    color: d.color as DeckColor,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export function toCard(c: DbCard): Card {
  c = englishStarterCard(c);
  return {
    id: c.id,
    deckId: c.deckId,
    front: c.front,
    back: c.back,
    unit: c.unit,
    examples: c.examples,
    easeFactor: c.easeFactor,
    intervalDays: c.intervalDays,
    repetitions: c.repetitions,
    lapses: c.lapses,
    suspended: c.suspended,
    suspensions: c.suspensions,
    dueAt: c.dueAt.toISOString(),
    lastReviewedAt: c.lastReviewedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function toText(t: DbText): ReadingText {
  return {
    id: t.id,
    title: t.title,
    body: t.body,
    ai: t.ai,
    rating: t.rating,
    reviewNote: t.reviewNote,
    ratedAt: t.ratedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** Owner-scoped deck CRUD and study counts (Recall `decks`). */
@Injectable()
export class DecksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<DeckWithStats[]> {
    const [decks, counts] = await Promise.all([
      this.prisma.englishDeck.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.$queryRaw<
        { deckId: string; total: number; due: number; suspended: number }[]
      >`SELECT "deckId",
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE NOT suspended AND "dueAt" <= now())::int AS due,
          COUNT(*) FILTER (WHERE suspended)::int AS suspended
        FROM english_cards WHERE "userId" = ${userId}::uuid GROUP BY "deckId"`,
    ]);
    const byDeck = new Map(counts.map((c) => [c.deckId, c]));
    return decks.map((d) => ({
      ...toDeck(d),
      total: byDeck.get(d.id)?.total ?? 0,
      due: byDeck.get(d.id)?.due ?? 0,
      suspended: byDeck.get(d.id)?.suspended ?? 0,
    }));
  }

  async get(userId: string, id: string): Promise<Deck> {
    const deck = await this.prisma.englishDeck.findFirst({
      where: { id, userId },
    });
    if (!deck) throw new NotFoundException('این دسته پیدا نشد.');
    return toDeck(deck);
  }

  async create(userId: string, input: CreateDeckInput): Promise<Deck> {
    return toDeck(
      await this.prisma.englishDeck.create({
        data: {
          userId,
          name: input.name,
          description: input.description ?? '',
          color: input.color ?? 'sky',
        },
      }),
    );
  }

  async update(
    userId: string,
    id: string,
    patch: UpdateDeckInput,
  ): Promise<Deck> {
    await this.get(userId, id);
    return toDeck(
      await this.prisma.englishDeck.update({ where: { id }, data: patch }),
    );
  }

  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    await this.get(userId, id);
    await this.prisma.englishDeck.delete({ where: { id } });
    return { deleted: true };
  }
}
