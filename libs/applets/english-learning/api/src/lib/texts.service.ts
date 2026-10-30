import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import type {
  CreateTextInput,
  ReadingText,
  ReviewTextInput,
} from '@all-in-one/applets/english-learning/contracts';
import { toText } from './decks.service';

/** Owner-scoped reading texts (Recall `texts`). */
@Injectable()
export class TextsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ReadingText[]> {
    const texts = await this.prisma.englishText.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return texts.map(toText);
  }

  async get(userId: string, id: string): Promise<ReadingText> {
    const text = await this.prisma.englishText.findFirst({
      where: { id, userId },
    });
    if (!text) throw new NotFoundException('این متن پیدا نشد.');
    return toText(text);
  }

  async create(userId: string, input: CreateTextInput): Promise<ReadingText> {
    return toText(
      await this.prisma.englishText.create({
        data: {
          userId,
          title: input.title,
          body: input.body,
          ai: !!input.ai,
        },
      }),
    );
  }

  async update(
    userId: string,
    id: string,
    patch: { title?: string; body?: string },
  ): Promise<ReadingText> {
    await this.get(userId, id);
    return toText(
      await this.prisma.englishText.update({ where: { id }, data: patch }),
    );
  }

  /** Rate an AI-written text; the notes steer the next AI text. */
  async review(
    userId: string,
    id: string,
    input: ReviewTextInput,
  ): Promise<ReadingText> {
    if (!(await this.get(userId, id)).ai)
      throw new BadRequestException('فقط متن‌های هوش مصنوعی امتیاز می‌گیرند.');
    return toText(
      await this.prisma.englishText.update({
        where: { id },
        data: {
          rating: input.rating,
          reviewNote: input.note ?? '',
          ratedAt: new Date(),
        },
      }),
    );
  }

  /** The most recently rated AI text. */
  latestFeedback(userId: string) {
    return this.prisma.englishText.findFirst({
      where: { userId, ai: true, rating: { not: null } },
      orderBy: { ratedAt: 'desc' },
      select: { title: true, rating: true, reviewNote: true },
    });
  }

  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    await this.get(userId, id);
    await this.prisma.englishText.delete({ where: { id } });
    return { deleted: true };
  }
}
