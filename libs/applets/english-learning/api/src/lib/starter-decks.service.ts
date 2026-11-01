import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import type {
  Deck,
  DeckColor,
  EnglishStats,
  StarterDeck,
} from '@all-in-one/applets/english-learning/contracts';
import { streakFrom } from '@all-in-one/applets/english-learning/contracts';
import { toIsoDate } from '@all-in-one/shared/schemas';
import { toDeck } from './decks.service';
import { ENGLISH_DECKS } from './starter-data';

const LEVEL_COLORS: Record<StarterDeck['level'], DeckColor> = {
  A1: 'sage',
  A2: 'sky',
  B1: 'violet',
  B2: 'amber',
  C1: 'rose',
};

/** Ready-made decks the user copies, and the library's study stats. */
@Injectable()
export class StarterDecksService {
  constructor(private readonly prisma: PrismaService) {}

  list(): StarterDeck[] {
    return ENGLISH_DECKS.map((d) => ({
      slug: d.slug,
      title: d.title,
      description: d.description,
      level: d.level,
      color: d.color ?? LEVEL_COLORS[d.level],
      cardCount: d.words.length,
    }));
  }

  /** Copies a starter deck (all cards new and due now) into the user's library. */
  async copy(userId: string, slug: string): Promise<Deck> {
    const starter = ENGLISH_DECKS.find((d) => d.slug === slug);
    if (!starter) throw new NotFoundException('این دسته آماده پیدا نشد.');
    const deck = await this.prisma.englishDeck.create({
      data: {
        userId,
        name: starter.title,
        description: starter.description,
        color: starter.color ?? LEVEL_COLORS[starter.level],
        cards: {
          create: starter.words.map((w) => ({
            userId,
            front: w.term,
            back: w.definition,
            examples: [w.example]
              .filter(Boolean)
              .map((line) => '- ' + line)
              .join('\n'),
          })),
        },
      },
    });
    return toDeck(deck);
  }

  async stats(userId: string): Promise<EnglishStats> {
    const now = new Date();
    const today = toIsoDate(now);
    const [due, total, mature, days] = await Promise.all([
      this.prisma.englishCard.count({
        where: { userId, suspended: false, dueAt: { lte: now } },
      }),
      this.prisma.englishCard.count({ where: { userId } }),
      this.prisma.englishCard.count({
        where: { userId, intervalDays: { gte: 21 } },
      }),
      this.prisma.englishReviewDay.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        take: 400,
      }),
    ]);
    const isoDays = days.map((d) => d.date.toISOString().slice(0, 10));
    return {
      due,
      total,
      mature,
      reviewedToday: days.find((_, i) => isoDays[i] === today)?.reviews ?? 0,
      streakDays: streakFrom(isoDays, today),
    };
  }
}
