import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type EnglishWord,
  type EnglishWordProgress,
  PrismaService,
} from '@all-in-one/api/db';
import {
  type CreateWordInput,
  type EnglishDeckSummary,
  type EnglishStats,
  MAX_BOX,
  type ReviewCard,
  type ReviewGrade,
  scheduleReview,
  streakFrom,
} from '@all-in-one/applets/english-learning/contracts';

const today = (now: Date) => now.toISOString().slice(0, 10);

function toCard(p: EnglishWordProgress & { word: EnglishWord }): ReviewCard {
  return {
    wordId: p.wordId,
    term: p.word.term,
    phonetic: p.word.phonetic,
    partOfSpeech: p.word.partOfSpeech,
    meaningFa: p.word.meaningFa,
    example: p.word.example,
    exampleFa: p.word.exampleFa,
    box: p.box,
  };
}

@Injectable()
export class EnglishService {
  constructor(private readonly prisma: PrismaService) {}

  async decks(userId: string): Promise<EnglishDeckSummary[]> {
    const decks = await this.prisma.englishDeck.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        words: {
          select: { progress: { where: { userId }, select: { box: true } } },
        },
      },
    });
    return decks.map((d) => {
      const progress = d.words.flatMap((w) => w.progress);
      return {
        slug: d.slug,
        title: d.title,
        description: d.description,
        level: d.level,
        wordCount: d.words.length,
        started: progress.length,
        mastered: progress.filter((p) => p.box >= MAX_BOX).length,
      };
    });
  }

  /** Adds the deck's words the user has not started yet; they are due now. */
  async startDeck(userId: string, slug: string): Promise<{ added: number }> {
    const deck = await this.prisma.englishDeck.findUnique({
      where: { slug },
      include: { words: true },
    });
    if (!deck) throw new NotFoundException('این مجموعه پیدا نشد');
    const result = await this.prisma.englishWordProgress.createMany({
      data: deck.words.map((w) => ({ userId, wordId: w.id })),
      skipDuplicates: true,
    });
    return { added: result.count };
  }

  async due(
    userId: string,
    limit: number,
    now = new Date(),
  ): Promise<ReviewCard[]> {
    const due = await this.prisma.englishWordProgress.findMany({
      where: { userId, dueAt: { lte: now } },
      orderBy: { dueAt: 'asc' },
      take: limit,
      include: { word: true },
    });
    return due.map(toCard);
  }

  async review(
    userId: string,
    wordId: string,
    grade: ReviewGrade,
    now = new Date(),
  ): Promise<ReviewCard> {
    const progress = await this.prisma.englishWordProgress.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });
    if (!progress) throw new NotFoundException('این واژه در مرور شما نیست');
    const next = scheduleReview(progress.box, grade, now);
    const day = new Date(`${today(now)}T00:00:00Z`);
    const [updated] = await this.prisma.$transaction([
      this.prisma.englishWordProgress.update({
        where: { userId_wordId: { userId, wordId } },
        data: {
          box: next.box,
          dueAt: next.dueAt,
          reviews: { increment: 1 },
          lapses: next.lapse ? { increment: 1 } : undefined,
          lastReviewedAt: now,
        },
        include: { word: true },
      }),
      this.prisma.englishReviewDay.upsert({
        where: { userId_date: { userId, date: day } },
        create: { userId, date: day, reviews: 1 },
        update: { reviews: { increment: 1 } },
      }),
    ]);
    return toCard(updated);
  }

  async stats(userId: string, now = new Date()): Promise<EnglishStats> {
    const [dueNow, learning, mastered, days] = await Promise.all([
      this.prisma.englishWordProgress.count({
        where: { userId, dueAt: { lte: now } },
      }),
      this.prisma.englishWordProgress.count({
        where: { userId, box: { lt: MAX_BOX } },
      }),
      this.prisma.englishWordProgress.count({
        where: { userId, box: { gte: MAX_BOX } },
      }),
      this.prisma.englishReviewDay.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        take: 400,
      }),
    ]);
    const isoDays = days.map((d) => d.date.toISOString().slice(0, 10));
    return {
      dueNow,
      learning,
      mastered,
      reviewedToday:
        days.find((d) => d.date.toISOString().slice(0, 10) === today(now))
          ?.reviews ?? 0,
      streakDays: streakFrom(isoDays, today(now)),
    };
  }

  async myWords(userId: string): Promise<ReviewCard[]> {
    const words = await this.prisma.englishWordProgress.findMany({
      where: { userId, word: { ownerId: userId } },
      orderBy: { createdAt: 'desc' },
      include: { word: true },
    });
    return words.map(toCard);
  }

  /** A user's own word; it enters review right away. */
  async addWord(userId: string, input: CreateWordInput): Promise<ReviewCard> {
    const word = await this.prisma.englishWord.create({
      data: {
        ownerId: userId,
        term: input.term,
        meaningFa: input.meaningFa,
        partOfSpeech: input.partOfSpeech ?? null,
        example: input.example ?? null,
        exampleFa: input.exampleFa ?? null,
        progress: { create: { userId } },
      },
      include: { progress: true },
    });
    return toCard({ ...word.progress[0], word });
  }

  async removeWord(userId: string, wordId: string): Promise<void> {
    const { count } = await this.prisma.englishWord.deleteMany({
      where: { id: wordId, ownerId: userId },
    });
    if (!count) throw new NotFoundException('واژه پیدا نشد');
  }
}
