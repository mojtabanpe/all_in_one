import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@all-in-one/api/db';
import { TelegramSectionsService } from './telegram-sections';
import { TelegramService } from './telegram.service';

const dbUrl =
  process.env['TELEGRAM_TEST_DATABASE_URL'] ??
  process.env['PLANNER_TEST_DATABASE_URL'];

describe.skipIf(!dbUrl)(
  'Telegram review reminder PostgreSQL integration (PG-012)',
  () => {
    let prisma: PrismaService;
    const createdUsers: string[] = [];
    const metricDays = ['2032-05-10', '2032-05-11'];

    const buildService = (membership: 'member' | 'left' = 'member') => {
      const config = new ConfigService({
        TELEGRAM_BOT_TOKEN: 'synthetic-token',
        TELEGRAM_BOT_USERNAME: '@poshtetgarm_bot',
        TELEGRAM_WEBHOOK_SECRET: 'x'.repeat(32),
        APP_PUBLIC_URL: 'https://poshtetgarm.ir/app',
      });
      const sent: { chatId: string; text: string; buttons?: unknown }[] = [];
      const stub = {} as never;
      const sections = new TelegramSectionsService(
        prisma,
        stub,
        stub,
        { filter: async () => [] } as never,
        stub,
        stub,
        stub,
        stub,
        { list: async () => [] } as never,
        {
          get: async (userId: string, id: string) =>
            prisma.englishCard.findFirstOrThrow({ where: { id, userId } }),
          review: async () => ({ id: '', deckId: '' }),
        } as never,
        stub,
        stub,
        stub,
        stub,
        stub,
      );
      const service = new TelegramService(
        prisma,
        config,
        stub,
        { filter: async () => [] } as never,
        stub,
        stub,
        stub,
        stub,
        sections,
      );
      const api = (
        service as unknown as {
          api: {
            call: (
              method: string,
              body: Record<string, unknown>,
            ) => Promise<unknown>;
            sendMessage: (
              chat: bigint,
              text: string,
              buttons?: unknown,
            ) => Promise<void>;
          };
        }
      ).api;
      api.call = async (method: string) =>
        method === 'getChatMember' ? { status: membership } : true;
      api.sendMessage = async (
        chat: bigint,
        text: string,
        buttons?: unknown,
      ) => {
        sent.push({ chatId: chat.toString(), text, buttons });
      };
      return { service, sent };
    };

    beforeAll(() => {
      if (
        !dbUrl ||
        !['localhost', '127.0.0.1'].includes(new URL(dbUrl).hostname)
      )
        throw new Error('Telegram DB tests require a local PostgreSQL URL');
      prisma = new PrismaService(new ConfigService({ DATABASE_URL: dbUrl }));
    });

    afterAll(async () => {
      vi.useRealTimers();
      if (!prisma) return;
      await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
      await prisma.telegramDailyCount.deleteMany({
        where: { day: { in: metricDays } },
      });
      await prisma.$disconnect();
    });

    it('persists entry on link codes, blocks Myket, and atomically counts concurrent links without PII', async () => {
      await prisma.telegramDailyCount.deleteMany({
        where: { day: { in: metricDays } },
      });
      const [u1, u2, u3, qaUser] = await Promise.all([
        prisma.user.create({ data: { email: null, role: 'CUSTOMER' } }),
        prisma.user.create({ data: { email: null, role: 'CUSTOMER' } }),
        prisma.user.create({ data: { email: null, role: 'CUSTOMER' } }),
        prisma.user.create({
          data: {
            email: `pg012-${randomUUID()}@example.invalid`,
            role: 'CUSTOMER',
          },
        }),
      ]);
      createdUsers.push(u1.id, u2.id, u3.id, qaUser.id);

      const { service } = buildService('member');

      // Myket creates nothing.
      await expect(
        service.createLink(u1.id, 'fa', 'myket', 'notify_failed'),
      ).rejects.toThrow();
      expect(
        await prisma.telegramLinkCode.count({ where: { userId: u1.id } }),
      ).toBe(0);

      vi.useFakeTimers();
      // 2032-05-10 19:00 Tehran = 15:30 UTC
      vi.setSystemTime(new Date('2032-05-10T15:30:00Z'));
      try {
        const [l1, l2, l3, lQa] = await Promise.all([
          service.createLink(u1.id, 'fa', 'bazaar', 'notify_failed'),
          service.createLink(u2.id, 'en', undefined, 'review_end'),
          service.createLink(u3.id, 'fa', undefined, 'notify_failed'),
          service.createLink(qaUser.id, 'fa', undefined, 'review_end'),
        ]);
        const codeOf = (url: string) => /start=([A-Za-z0-9_-]+)$/.exec(url)![1];

        const stored = await prisma.telegramLinkCode.findMany({
          where: { userId: { in: [u1.id, u2.id] } },
          orderBy: { language: 'asc' },
        });
        expect(stored.map((r) => [r.language, r.entry])).toEqual([
          ['en', 'review_end'],
          ['fa', 'notify_failed'],
        ]);

        const baseChat = BigInt(
          Math.floor(Math.random() * 1_000_000_000) + 1e9,
        );
        // Simulate double-tap race on u1's code plus concurrent links for u2, u3, and qaUser.
        await Promise.all([
          service.handle({
            message: {
              text: `/start ${codeOf(l1.url)}`,
              chat: { id: Number(baseChat + 1n), type: 'private' },
            },
          }),
          service.handle({
            message: {
              text: `/start ${codeOf(l1.url)}`,
              chat: { id: Number(baseChat + 1n), type: 'private' },
            },
          }),
          service.handle({
            message: {
              text: `/start ${codeOf(l2.url)}`,
              chat: { id: Number(baseChat + 2n), type: 'private' },
            },
          }),
          service.handle({
            message: {
              text: `/start ${codeOf(l3.url)}`,
              chat: { id: Number(baseChat + 3n), type: 'private' },
            },
          }),
          service.handle({
            message: {
              text: `/start ${codeOf(lQa.url)}`,
              chat: { id: Number(baseChat + 4n), type: 'private' },
            },
          }),
        ]);

        const rows = await service.dailyCounts('2032-05-10', '2032-05-10');
        expect(rows).toEqual([
          {
            day: '2032-05-10',
            kind: 'linked',
            entry: 'notify_failed',
            count: 2,
          },
          {
            day: '2032-05-10',
            kind: 'linked',
            entry: 'review_end',
            count: 1,
          },
        ]);
        for (const row of rows) {
          expect(Object.keys(row).sort()).toEqual([
            'count',
            'day',
            'entry',
            'kind',
          ]);
        }
      } finally {
        vi.useRealTimers();
      }
    });

    it('delivers at most one 20:00 Tehran review reminder per day and starts review on button tap', async () => {
      const [dueFa, dueEn, offUser, emptyUser, nonMemberUser] =
        await Promise.all([
          prisma.user.create({ data: { email: null, role: 'CUSTOMER' } }),
          prisma.user.create({ data: { email: null, role: 'CUSTOMER' } }),
          prisma.user.create({ data: { email: null, role: 'CUSTOMER' } }),
          prisma.user.create({ data: { email: null, role: 'CUSTOMER' } }),
          prisma.user.create({ data: { email: null, role: 'CUSTOMER' } }),
        ]);
      createdUsers.push(
        dueFa.id,
        dueEn.id,
        offUser.id,
        emptyUser.id,
        nonMemberUser.id,
      );

      const baseChat = BigInt(Math.floor(Math.random() * 1_000_000_000) + 2e9);
      await prisma.telegramLink.createMany({
        data: [
          {
            userId: dueFa.id,
            chatId: baseChat + 1n,
            language: 'fa',
            lastSummaryDay: '2032-05-11',
          },
          {
            userId: dueEn.id,
            chatId: baseChat + 2n,
            language: 'en',
            lastSummaryDay: '2032-05-11',
          },
          {
            userId: offUser.id,
            chatId: baseChat + 3n,
            language: 'fa',
            lastSummaryDay: '2032-05-11',
          },
          {
            userId: emptyUser.id,
            chatId: baseChat + 4n,
            language: 'fa',
            lastSummaryDay: '2032-05-11',
          },
        ],
      });
      await prisma.reviewReminderSetting.create({
        data: { userId: offUser.id, enabled: false, time: '20:00' },
      });

      const dueAt = new Date('2032-05-11T12:00:00Z');
      const futureDue = new Date('2032-05-15T12:00:00Z');
      for (const [owner, cards] of [
        [
          dueFa.id,
          [
            { front: 'meticulous', back: 'دقیق', dueAt, suspended: false },
            { front: 'suspended-word', back: 'x', dueAt, suspended: true },
          ],
        ],
        [
          dueEn.id,
          [
            {
              front: 'ephemeral',
              back: 'short-lived',
              dueAt,
              suspended: false,
            },
            {
              front: 'ubiquitous',
              back: 'everywhere',
              dueAt,
              suspended: false,
            },
          ],
        ],
        [
          offUser.id,
          [{ front: 'muted', back: 'خاموش', dueAt, suspended: false }],
        ],
        [
          emptyUser.id,
          [
            {
              front: 'later',
              back: 'بعداً',
              dueAt: futureDue,
              suspended: false,
            },
          ],
        ],
      ] as const) {
        const deck = await prisma.englishDeck.create({
          data: { userId: owner, name: 'Core' },
        });
        await prisma.englishCard.createMany({
          data: cards.map((card) => ({
            userId: owner,
            deckId: deck.id,
            front: card.front,
            back: card.back,
            dueAt: card.dueAt,
            suspended: card.suspended,
          })),
        });
      }

      const a = buildService('member');
      const b = buildService('member');

      // 19:59 Tehran on 2032-05-11 (16:29 UTC): before 20:00 -> nothing sent.
      await a.service.tick(new Date('2032-05-11T16:29:00Z'));
      expect(a.sent).toHaveLength(0);

      // Two API instances racing at 20:05 Tehran (16:35 UTC): each eligible user gets exactly 1 message.
      await Promise.all([
        a.service.tick(new Date('2032-05-11T16:35:00Z')),
        b.service.tick(new Date('2032-05-11T16:35:00Z')),
      ]);
      const delivered = [...a.sent, ...b.sent].filter((m) =>
        [
          String(baseChat + 1n),
          String(baseChat + 2n),
          String(baseChat + 3n),
          String(baseChat + 4n),
        ].includes(m.chatId),
      );
      expect(delivered).toHaveLength(2);
      expect(delivered.find((m) => m.chatId === String(baseChat + 1n))).toEqual(
        {
          chatId: String(baseChat + 1n),
          text: '۱ کارت آمادهٔ مرور داری.',
          buttons: [[{ text: 'شروع مرور', callback_data: 'E:cd:all' }]],
        },
      );
      expect(delivered.find((m) => m.chatId === String(baseChat + 2n))).toEqual(
        {
          chatId: String(baseChat + 2n),
          text: 'You have 2 cards ready to review.',
          buttons: [[{ text: 'Start review', callback_data: 'E:cd:all' }]],
        },
      );

      // Another sweep at 22:00 Tehran (18:30 UTC) sends nothing more.
      await a.service.tick(new Date('2032-05-11T18:30:00Z'));
      expect(
        [...a.sent, ...b.sent].filter((m) =>
          [String(baseChat + 1n), String(baseChat + 2n)].includes(m.chatId),
        ),
      ).toHaveLength(2);

      // Non-member account with due cards receives nothing.
      const nmDeck = await prisma.englishDeck.create({
        data: { userId: nonMemberUser.id, name: 'NM' },
      });
      await prisma.englishCard.create({
        data: {
          userId: nonMemberUser.id,
          deckId: nmDeck.id,
          front: 'blocked',
          back: 'بسته',
          dueAt,
        },
      });
      await prisma.telegramLink.create({
        data: {
          userId: nonMemberUser.id,
          chatId: baseChat + 5n,
          language: 'fa',
          lastSummaryDay: '2032-05-11',
        },
      });
      const nm = buildService('left');
      await nm.service.tick(new Date('2032-05-11T18:35:00Z'));
      expect(nm.sent).toHaveLength(0);
      const nmLink = await prisma.telegramLink.findUniqueOrThrow({
        where: { userId: nonMemberUser.id },
      });
      expect(nmLink.lastReviewReminderDay).toBeNull();

      // Aggregate count recorded exactly 2 reminders for 2032-05-11.
      const counts = await a.service.dailyCounts('2032-05-11', '2032-05-11');
      expect(counts).toContainEqual({
        day: '2032-05-11',
        kind: 'reminder_sent',
        entry: '',
        count: 2,
      });

      // Pressing the inline button starts the existing card review flow on real DB cards.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2032-05-11T18:40:00Z'));
      try {
        const beforeTap = a.sent.length;
        await a.service.handle({
          callback_query: {
            id: 'q-db',
            data: 'E:cd:all',
            message: { chat: { id: Number(baseChat + 1n) } },
          },
        });
        const cardMsg = a.sent
          .slice(beforeTap)
          .find((m) => m.text.includes('meticulous'));
        expect(cardMsg).toBeDefined();
        expect(JSON.stringify(cardMsg?.buttons)).toContain('c:a:');
      } finally {
        vi.useRealTimers();
      }
    });
  },
);
