import type { PrismaService } from '@all-in-one/api/db';
import { DAILY_LIFE_SAMPLE } from '@all-in-one/applets/english-learning/contracts';
import { StarterDecksService } from './starter-decks.service';

it('saves the preview once per account, even for concurrent requests', async () => {
  type Saved = {
    id: string;
    userId: string;
    name: string;
    color: string;
    cards: { create: { front: string; back: string; examples: string }[] };
  };
  const rows = new Map<
    string,
    Saved & { createdAt: Date; updatedAt: Date; description: string }
  >();
  const englishDeck = {
    findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
      const row = rows.get(where.id);
      return row?.userId === where.userId ? row : null;
    },
    create: async ({ data }: { data: Saved }) => {
      if (rows.has(data.id)) throw new Error('duplicate primary key');
      const row = {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
        description: '',
      };
      rows.set(data.id, row);
      return row;
    },
  };
  const service = new StarterDecksService({
    englishDeck,
  } as unknown as PrismaService);
  const [first, retry] = await Promise.all([
    service.saveDailyLifeSample('a'),
    service.saveDailyLifeSample('a'),
  ]);
  expect(retry.id).toBe(first.id);
  const cards = rows.get(first.id)!.cards.create;
  expect(cards).toHaveLength(5);
  expect(cards.map((c) => [c.front, c.back, c.examples])).toEqual(
    DAILY_LIFE_SAMPLE.map((c) => [c.term, c.definition, '- ' + c.example]),
  );
  cards[0].back = 'My edited definition';
  await service.saveDailyLifeSample('a');
  expect(rows.get(first.id)!.cards.create[0].back).toBe('My edited definition');
  expect((await service.saveDailyLifeSample('b')).id).not.toBe(first.id);
});
