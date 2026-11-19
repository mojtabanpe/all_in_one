import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  plainReply,
  summaryText,
  telegramCodeHash,
  TelegramService,
} from './telegram.service';
import { TelegramSectionsService } from './telegram-sections';
import { parseExpenseLines } from './telegram-format';

const env: Record<string, string> = {
  TELEGRAM_BOT_TOKEN: 'token',
  TELEGRAM_BOT_USERNAME: '@poshtetgarm_bot',
  TELEGRAM_WEBHOOK_SECRET: 'x'.repeat(32),
  APP_PUBLIC_URL: 'https://poshtetgarm.ir/app',
};
const config = { get: (key: string) => env[key] } as unknown as ConfigService;

function setup(
  membership: string | Error = 'member',
  enabledApplets: string[] | null = null,
) {
  const sent: { chat: string; text: string; buttons?: unknown }[] = [];
  const db = {
    telegramLink: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(() => ({ count: 1 })),
      create: vi.fn((x) => x),
      updateMany: vi.fn(() => ({ count: 1 })),
    },
    telegramLinkCode: {
      findUnique: vi.fn(),
      deleteMany: vi.fn((x) => x),
      create: vi.fn((x) => x),
    },
    englishCard: { count: vi.fn(() => 0), findFirst: vi.fn() },
    user: {
      findUnique: vi.fn(async () => ({ enabledApplets, role: 'CUSTOMER' })),
    },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  const assistant = { chat: vi.fn() };
  const tasks = {
    filter: vi.fn(() => []),
    update: vi.fn(),
    create: vi.fn(async (_u: string, input: { title: string }) => ({
      id: 't9',
      title: input.title,
    })),
  };
  const gateway = { transcribe: vi.fn() };
  const englishAi = {
    dialogue: vi.fn(),
    writingTask: vi.fn(),
    writingFeedback: vi.fn(),
    readingText: vi.fn(),
  };
  const speech = {
    speak: vi.fn(async () => ({
      audio: Buffer.from('mp3'),
      contentType: 'audio/mpeg',
    })),
  };
  const scores = { save: vi.fn() };
  const habits = { all: vi.fn(async () => []), get: vi.fn(), checkin: vi.fn() };
  const health = {
    nutritionDay: vi.fn(async () => ({
      calories: 900,
      calorieTarget: 2000,
      proteinG: 40,
      carbsG: 100,
      fatG: 30,
      meals: [],
    })),
    week: vi.fn(async () => ({ sessions: 1, minutes: 30, goalMinutes: 150 })),
  };
  const body = {
    fasting: vi.fn(async () => ({ active: null, recent: [] })),
    startFast: vi.fn(),
    endFast: vi.fn(),
    weight: vi.fn(async () => ({
      currentKg: 82.5,
      targetKg: null,
      targetDate: null,
      plan: null,
      entries: [],
    })),
    logWeight: vi.fn(),
    setGoal: vi.fn(),
  };
  const training = { routines: vi.fn(async () => []), exercises: vi.fn() };
  const decks = { list: vi.fn(async () => []) };
  const cards = { get: vi.fn(), review: vi.fn() };
  const texts = { list: vi.fn(async () => []), get: vi.fn(), create: vi.fn() };
  const report = (over = false) => ({
    from: '2026-11-01',
    to: '2026-11-30',
    totalAmount: 130000,
    todayAmount: 130000,
    dailyAverage: 7000,
    transactionCount: 2,
    byCategory: [
      {
        categoryId: 'food',
        name: 'خوراک',
        amount: 130000,
        percentage: 100,
        monthlyBudget: 100000,
        budgetUsedPercent: 130,
        overBudget: over,
      },
    ],
  });
  const expenses = {
    getReport: vi.fn(async () => report(true)),
    listCategories: vi.fn(async () => []),
    updateCategory: vi.fn(),
    createExpense: vi.fn(
      async (_u: string, input: { title: string; amount: number }) => ({
        ...input,
        categoryId: 'food',
        categoryName: 'خوراک',
      }),
    ),
  };
  const sections = new TelegramSectionsService(
    db as never,
    assistant as never,
    gateway as never,
    tasks as never,
    habits as never,
    health as never,
    body as never,
    training as never,
    decks as never,
    cards as never,
    texts as never,
    englishAi as never,
    speech as never,
    scores as never,
    expenses as never,
  );
  const service = new TelegramService(
    db as never,
    config,
    assistant as never,
    tasks as never,
    gateway as never,
    englishAi as never,
    speech as never,
    scores as never,
    sections,
  );
  const api = (
    service as unknown as {
      api: {
        call: unknown;
        sendMessage: unknown;
        sendVoice: unknown;
        download: unknown;
      };
    }
  ).api;
  const voices: { caption: string; buttons?: unknown }[] = [];
  api.sendVoice = vi.fn(
    async (
      _chat: bigint,
      _audio: unknown,
      caption: string,
      buttons?: unknown,
    ) => {
      voices.push({ caption, buttons });
    },
  );
  api.download = vi.fn(async () => Buffer.from('ogg'));
  api.sendMessage = vi.fn(
    async (chat: bigint, text: string, buttons?: unknown) => {
      sent.push({ chat: chat.toString(), text, buttons });
    },
  );
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  api.call = vi.fn(async (method: string, body: Record<string, unknown>) => {
    calls.push({ method, body });
    if (method !== 'getChatMember') return true;
    if (membership instanceof Error) throw membership;
    return { status: membership };
  });
  return {
    service,
    db,
    assistant,
    tasks,
    sent,
    calls,
    gateway,
    englishAi,
    speech,
    scores,
    voices,
    habits,
    health,
    body,
    decks,
    cards,
    expenses,
  };
}
const message = (text: string, id = 42) => ({
  message: { text, chat: { id, type: 'private' } },
});

describe('Telegram bot', () => {
  it('creates a one-time link and stores only the hash', async () => {
    const { service, db } = setup();
    const { url } = await service.createLink('u1', 'fa');
    const code = /start=([A-Za-z0-9_-]+)$/.exec(url)?.[1] as string;
    expect(url.startsWith('https://t.me/poshtetgarm_bot?start=')).toBe(true);
    const stored = db.telegramLinkCode.create.mock.calls[0][0].data;
    expect(stored.codeHash).toBe(telegramCodeHash(code));
    expect(JSON.stringify(stored)).not.toContain(code);
  });

  it('links a chat with a valid code and refuses an expired one', async () => {
    const { service, db, sent } = setup();
    db.telegramLink.findUnique.mockResolvedValue(null);
    db.telegramLinkCode.findUnique.mockResolvedValueOnce({
      userId: 'u1',
      language: 'fa',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await service.handle(message('/start abcdefghijklmnopqrstuvwx'));
    expect(db.telegramLink.create).toHaveBeenCalledWith({
      data: { userId: 'u1', chatId: 42n, language: 'fa' },
    });
    expect(sent[0].text).toContain('وصل شد');

    db.telegramLinkCode.findUnique.mockResolvedValueOnce({
      userId: 'u1',
      language: 'fa',
      expiresAt: new Date(Date.now() - 1),
    });
    await service.handle(message('/start abcdefghijklmnopqrstuvwx'));
    expect(db.telegramLink.create).toHaveBeenCalledTimes(1);
    expect(sent[1].text).toContain('منقضی');
  });

  it('ignores groups and asks unlinked chats to link first', async () => {
    const { service, db, assistant, sent } = setup();
    await service.handle({
      message: { text: 'hi', chat: { id: 1, type: 'group' } },
    });
    expect(sent).toHaveLength(0);
    db.telegramLink.findUnique.mockResolvedValue(null);
    await service.handle(message('خرید نان'));
    expect(assistant.chat).not.toHaveBeenCalled();
    expect(sent[0].text).toContain('وصل');
  });

  it('logs a message through the assistant and answers in plain text', async () => {
    const { service, db, assistant, sent } = setup();
    db.telegramLink.findUnique.mockResolvedValue({
      userId: 'u1',
      chatId: 42n,
      language: 'fa',
    });
    assistant.chat.mockResolvedValue({ reply: '**ثبت شد**: خرید نان' });
    await service.handle(message('خرید نان'));
    expect(assistant.chat).toHaveBeenCalledWith('u1', {
      language: 'fa',
      messages: [{ role: 'user', content: 'خرید نان' }],
    });
    expect(sent[0].text).toBe('ثبت شد: خرید نان');
  });

  it('answers «subscription needed» when the account has no AI access', async () => {
    const { service, db, assistant, sent } = setup();
    db.telegramLink.findUnique.mockResolvedValue({
      userId: 'u1',
      chatId: 42n,
      language: 'fa',
    });
    assistant.chat.mockRejectedValue(
      new HttpException({ code: 'AI_PLAN_REQUIRED' }, 402),
    );
    await service.handle(message('خرید نان'));
    expect(sent[0].text).toContain('اشتراک');
    expect(JSON.stringify(sent[0].buttons)).toContain(
      'https://poshtetgarm.ir/app/billing',
    );
  });

  it('/stop removes the link', async () => {
    const { service, db } = setup();
    db.telegramLink.findUnique.mockResolvedValue({
      userId: 'u1',
      chatId: 42n,
      language: 'fa',
    });
    await service.handle(message('/stop'));
    expect(db.telegramLink.deleteMany).toHaveBeenCalledWith({
      where: { chatId: 42n },
    });
  });

  it('sends the morning summary once, inside its window, only with something to do', async () => {
    const { service, db, tasks, sent } = setup();
    const link = {
      userId: 'u1',
      chatId: 42n,
      language: 'fa',
      lastSummaryDay: null,
      user: { progressNotification: null },
    };
    db.telegramLink.findMany.mockResolvedValue([link]);
    tasks.filter.mockResolvedValue([
      { id: 't1', title: 'خرید نان', kind: 'TASK' },
    ] as never);
    // 09:00 Tehran (05:30 UTC): before the 10:00 default.
    await service.tick(new Date('2026-11-19T05:30:00Z'));
    expect(sent).toHaveLength(0);
    // 10:30 Tehran.
    await service.tick(new Date('2026-11-19T07:00:00Z'));
    expect(db.telegramLink.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', lastSummaryDay: null },
      data: { lastSummaryDay: '2026-11-19' },
    });
    expect(sent[0].text).toContain('خرید نان');
    expect(JSON.stringify(sent[0].buttons)).toContain('d:t1');
    // Another sweep that loses the claim sends nothing.
    db.telegramLink.updateMany.mockResolvedValue({ count: 0 } as never);
    await service.tick(new Date('2026-11-19T07:01:00Z'));
    expect(sent).toHaveLength(1);
  });

  it('formats the summary and plain replies', () => {
    expect(summaryText('fa', [], 0)).toBeNull();
    expect(summaryText('en', [{ title: 'a' }], 2)).toBe(
      'Today: 1 open task\n• a\n2 cards ready to review',
    );
    expect(plainReply('## Title\n**bold** text')).toBe('Title\nbold text');
  });

  describe('main channel membership (directive 170)', () => {
    const code = 'abcdefghijklmnopqrstuvwx';
    const valid = {
      userId: 'u1',
      language: 'fa',
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('asks a non-member to join before linking, then links on «I joined»', async () => {
      const { service, db, sent, calls } = setup('left');
      db.telegramLink.findUnique.mockResolvedValue(null);
      db.telegramLinkCode.findUnique.mockResolvedValue(valid);
      await service.handle(message(`/start ${code}`));
      expect(db.telegramLink.create).not.toHaveBeenCalled();
      expect(calls.find((c) => c.method === 'getChatMember')?.body).toEqual({
        chat_id: '@poshtetgarm',
        user_id: 42,
      });
      expect(sent[0].text).toContain('@poshtetgarm');
      expect(JSON.stringify(sent[0].buttons)).toContain(`j:${code}`);

      // Still not a member: an alert, no link.
      await service.handle({
        callback_query: {
          id: 'q',
          data: `j:${code}`,
          message: { chat: { id: 42 } },
        },
      });
      expect(db.telegramLink.create).not.toHaveBeenCalled();

      const joined = setup('member');
      joined.db.telegramLink.findUnique.mockResolvedValue(null);
      joined.db.telegramLinkCode.findUnique.mockResolvedValue(valid);
      await joined.service.handle({
        callback_query: {
          id: 'q',
          data: `j:${code}`,
          message: { chat: { id: 42 } },
        },
      });
      expect(joined.db.telegramLink.create).toHaveBeenCalled();
    });

    it("does not pass a linked non-member's message to the assistant", async () => {
      const { service, db, assistant, sent } = setup('kicked');
      db.telegramLink.findUnique.mockResolvedValue({
        userId: 'u1',
        chatId: 42n,
        language: 'fa',
      });
      await service.handle(message('خرید نان'));
      expect(assistant.chat).not.toHaveBeenCalled();
      expect(sent[0].text).toContain('عضو شو');
    });

    it('lets users through while the bot cannot read the channel members', async () => {
      const { service, db, assistant } = setup(new Error('400'));
      db.telegramLink.findUnique.mockResolvedValue({
        userId: 'u1',
        chatId: 42n,
        language: 'fa',
      });
      assistant.chat.mockResolvedValue({ reply: 'ok' });
      await service.handle(message('خرید نان'));
      expect(assistant.chat).toHaveBeenCalled();
    });
  });

  describe('shadowing in Telegram', () => {
    const linked = (shadow: unknown = null) => ({
      userId: 'u1',
      chatId: 42n,
      language: 'fa',
      shadow,
    });
    const voice = (id = 42) => ({
      message: {
        voice: { file_id: 'f1', file_size: 2000 },
        chat: { id, type: 'private' },
      },
    });

    it('/shadow starts a dialogue and sends the first sentence as speech', async () => {
      const t = setup();
      t.db.telegramLink.findUnique.mockResolvedValue(linked());
      t.englishAi.dialogue.mockResolvedValue({
        title: 'At the café',
        lines: [
          { speaker: 'A', text: 'Can I get a coffee?' },
          { speaker: 'B', text: 'Sure, anything else?' },
        ],
      });
      await t.service.handle(message('/shadow'));
      const saved = t.db.telegramLink.updateMany.mock.calls[0][0].data.shadow;
      expect(saved).toMatchObject({ index: 0, scores: [null, null] });
      expect(t.speech.speak).toHaveBeenCalledWith(
        'u1',
        'Can I get a coffee?',
        'primary',
      );
      expect(t.voices[0].caption).toContain('Can I get a coffee?');
      expect(JSON.stringify(t.voices[0].buttons)).toContain('s:n');
    });

    it('checks a voice message word by word and moves on', async () => {
      const t = setup();
      const state = {
        title: 'At the café',
        lines: ['Can I get a coffee?', 'Sure, anything else?'],
        index: 0,
        scores: [null, null],
        mistakes: 0,
      };
      t.db.telegramLink.findUnique.mockResolvedValue(linked(state));
      t.gateway.transcribe.mockResolvedValue('can I get coffee');
      await t.service.handle(voice());
      expect(t.gateway.transcribe).toHaveBeenCalledWith(
        'u1',
        expect.any(Buffer),
        'audio/ogg',
      );
      expect(t.sent[0].text).toContain('جاافتاده: a');
      expect(
        t.db.telegramLink.updateMany.mock.calls[0][0].data.shadow,
      ).toMatchObject({ index: 1 });
      expect(t.voices[0].caption).toContain('Sure, anything else?');
    });

    it('saves the session score at the end, counting unrecorded sentences as 0', async () => {
      const t = setup();
      const state = {
        title: 'At the café',
        lines: ['Can I get a coffee?', 'Sure, anything else?'],
        index: 1,
        scores: [null, null],
        mistakes: 0,
      };
      t.db.telegramLink.findUnique.mockResolvedValue(linked(state));
      t.gateway.transcribe.mockResolvedValue('sure anything else');
      await t.service.handle(voice());
      expect(t.scores.save).toHaveBeenCalledWith('u1', {
        kind: 'SHADOWING',
        title: 'At the café',
        score: 50,
        items: 2,
        attempted: 1,
        mistakes: 0,
      });
      expect(t.sent.at(-1)?.text).toContain('۵۰');
    });

    it('a voice message without a practice suggests /shadow', async () => {
      const t = setup();
      t.db.telegramLink.findUnique.mockResolvedValue(linked());
      await t.service.handle(voice());
      expect(t.gateway.transcribe).not.toHaveBeenCalled();
      expect(t.sent[0].text).toContain('/shadow');
    });
  });

  describe('menu (directive 172)', () => {
    const linked = { userId: 'u1', chatId: 42n, language: 'fa', shadow: null };

    it('shows the reply keyboard after linking and on /help', async () => {
      const t = setup();
      t.db.telegramLink.findUnique.mockResolvedValue(null);
      t.db.telegramLinkCode.findUnique.mockResolvedValue({
        userId: 'u1',
        language: 'fa',
        expiresAt: new Date(Date.now() + 60_000),
      });
      await t.service.handle(message('/start abcdefghijklmnopqrstuvwx'));
      expect(t.sent[0].buttons).toMatchObject({
        keyboard: [
          [{ text: 'برنامه‌ریز' }, { text: 'زبان' }],
          [{ text: 'سلامت' }],
          [{ text: 'کارهای امروز' }, { text: 'راهنما' }],
        ],
      });
      t.db.telegramLink.findUnique.mockResolvedValue(linked);
      await t.service.handle(message('راهنما'));
      expect(t.sent[1].text).toContain('سلامت');
      expect(t.assistant.chat).not.toHaveBeenCalled();
    });

    it('«کارهای امروز» sends today on demand, or says the day is empty', async () => {
      const t = setup();
      t.db.telegramLink.findUnique.mockResolvedValue(linked);
      await t.service.handle(message('کارهای امروز'));
      expect(t.sent[0].text).toContain('کار باز');
      t.tasks.filter.mockResolvedValue([
        { id: 't1', title: 'خرید نان', kind: 'TASK' },
      ] as never);
      await t.service.handle(message('/today'));
      expect(t.sent[1].text).toContain('خرید نان');
      expect(t.assistant.chat).not.toHaveBeenCalled();
    });

    it('/stop removes the keyboard', async () => {
      const t = setup();
      t.db.telegramLink.findUnique.mockResolvedValue(linked);
      await t.service.handle(message('/stop'));
      expect(t.sent[0].buttons).toEqual({ remove_keyboard: true });
    });

    it('registers commands and descriptions in both languages', async () => {
      const t = setup();
      await t.service.registerMenu();
      const commands = t.calls.filter((c) => c.method === 'setMyCommands');
      expect(commands).toHaveLength(2);
      expect(commands[1].body.language_code).toBe('en');
      expect(JSON.stringify(commands[0].body)).toContain('today');
    });
  });

  describe('app sections (directive 174)', () => {
    const linked = (pending: unknown = null) => ({
      userId: 'u1',
      chatId: 42n,
      language: 'fa',
      shadow: null,
      pending,
    });
    const press = (data: string) => ({
      callback_query: { id: 'q', data, message: { chat: { id: 42 } } },
    });
    const savedPending = (t: ReturnType<typeof setup>) =>
      (
        t.db.telegramLink.updateMany.mock.calls.at(-1) as unknown as [
          { data: { pending: unknown } },
        ]
      )[0].data.pending;

    it('shows expenses in the keyboard only when the account turned it on', async () => {
      const off = setup();
      off.db.telegramLink.findUnique.mockResolvedValue(linked());
      await off.service.handle(message('/help'));
      expect(JSON.stringify(off.sent[0].buttons)).not.toContain('مخارج');
      await off.service.handle(message('مخارج'));
      expect(off.sent[1].text).toContain('خاموش');
      expect(off.expenses.getReport).not.toHaveBeenCalled();

      const on = setup('member', ['planner', 'english', 'health', 'expenses']);
      on.db.telegramLink.findUnique.mockResolvedValue(linked());
      await on.service.handle(message('/help'));
      expect(JSON.stringify(on.sent[0].buttons)).toContain('مخارج');
      await on.service.handle(message('مخارج'));
      expect(on.sent[1].text).toContain('۱۳۰٬۰۰۰ تومان');
      expect(on.sent[1].text).toContain('⚠️');
      expect(on.assistant.chat).not.toHaveBeenCalled();
    });

    it('health menu shows calories; fasting starts and weight is logged without AI', async () => {
      const t = setup();
      t.db.telegramLink.findUnique.mockResolvedValue(linked());
      await t.service.handle(message('سلامت'));
      expect(t.sent[0].text).toContain('۹۰۰ از ۲٬۰۰۰ کالری');
      expect(JSON.stringify(t.sent[0].buttons)).toContain('H:f');

      await t.service.handle(press('H:fs:16'));
      expect(t.body.startFast).toHaveBeenCalledWith('u1', { targetHours: 16 });

      await t.service.handle(press('H:wl'));
      expect(savedPending(t)).toMatchObject({ kind: 'weight' });
      t.db.telegramLink.findUnique.mockResolvedValue(
        linked({ kind: 'weight', at: Date.now() }),
      );
      await t.service.handle(message('۸۲٫۵'));
      expect(t.body.logWeight).toHaveBeenCalledWith('u1', {
        date: expect.any(String),
        weightKg: 82.5,
      });
      expect(t.sent.at(-1)?.text).toContain('۸۲٫۵ کیلو');
      expect(t.assistant.chat).not.toHaveBeenCalled();
    });

    it('a pending meal goes through the assistant and needs AI access', async () => {
      const t = setup();
      t.db.telegramLink.findUnique.mockResolvedValue(
        linked({ kind: 'meal', mealType: 'LUNCH', at: Date.now() }),
      );
      t.assistant.chat.mockRejectedValue(
        new HttpException({ code: 'AI_PLAN_REQUIRED' }, 402),
      );
      await t.service.handle(message('قرمه‌سبزی'));
      expect(t.assistant.chat).toHaveBeenCalledWith('u1', {
        language: 'fa',
        messages: [
          { role: 'user', content: 'این را ناهار امروز ثبت کن: قرمه‌سبزی' },
        ],
      });
      expect(t.sent.at(-1)?.text).toContain('اشتراک');
    });

    it('an expired question is ignored and the message goes to the assistant', async () => {
      const t = setup();
      t.db.telegramLink.findUnique.mockResolvedValue(
        linked({ kind: 'weight', at: Date.now() - 2 * 3_600_000 }),
      );
      t.assistant.chat.mockResolvedValue({ reply: 'ok' });
      await t.service.handle(message('۸۲'));
      expect(t.body.logWeight).not.toHaveBeenCalled();
      expect(t.assistant.chat).toHaveBeenCalled();
    });

    it('reviews cards: front, answer, grade with SM-2, next card', async () => {
      const t = setup();
      const id = '11111111-1111-4111-8111-111111111111';
      t.db.telegramLink.findUnique.mockResolvedValue(linked());
      t.db.englishCard.findFirst.mockResolvedValue({
        id,
        front: 'ubiquitous',
        unit: '',
      });
      t.db.englishCard.count.mockResolvedValue(3 as never);
      await t.service.handle(press('E:cd:all'));
      expect(t.sent[0].text).toContain('ubiquitous');
      expect(JSON.stringify(t.sent[0].buttons)).toContain(`c:a:${id}:a`);

      t.cards.get.mockResolvedValue({
        id,
        deckId: 'd1',
        front: 'ubiquitous',
        back: 'found everywhere',
        examples: '',
      });
      await t.service.handle(press(`c:a:${id}:a`));
      expect(t.sent[1].text).toContain('found everywhere');
      expect(JSON.stringify(t.sent[1].buttons)).toContain(`c:g:${id}:2:a`);

      t.cards.review.mockResolvedValue({ id, deckId: 'd1' });
      t.db.englishCard.findFirst.mockResolvedValue(null);
      await t.service.handle(press(`c:g:${id}:2:a`));
      expect(t.cards.review).toHaveBeenCalledWith('u1', id, 'good');
      expect(t.sent[2].text).toContain('مرور تمام شد');
    });

    it('writing practice: task, then feedback scored and saved like the app', async () => {
      const t = setup();
      t.db.telegramLink.findUnique.mockResolvedValue(linked());
      t.englishAi.writingTask.mockResolvedValue({
        scenario: 'Invite a friend',
        message: 'Are you free?',
      });
      await t.service.handle(press('E:w'));
      expect(t.sent[0].text).toContain('Invite a friend');
      const pending = savedPending(t) as { situation: string };
      expect(pending).toMatchObject({ kind: 'writing' });

      t.db.telegramLink.findUnique.mockResolvedValue(
        linked({ ...pending, at: Date.now() }),
      );
      t.englishAi.writingFeedback.mockResolvedValue({
        corrected: 'Yes, I am free.',
        natural: "Yeah, I'm free.",
        mistakes: [{ original: 'is', fix: 'am', why: '' }],
        phrases: [],
        comment: '',
      });
      await t.service.handle(message('Yes I is free tonight'));
      expect(t.scores.save).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ kind: 'WRITING', items: 5, mistakes: 1 }),
      );
      expect(t.sent.at(-1)?.text).toContain('is → am');
    });

    it('listening: the last answer saves the score', async () => {
      const t = setup();
      t.db.telegramLink.findUnique.mockResolvedValue(
        linked({
          kind: 'listening',
          title: 'Café',
          lines: ['A: Hi'],
          questions: [
            { question: 'Where?', options: ['café', 'bank'], answer: 0 },
          ],
          index: 0,
          correct: 0,
          at: Date.now(),
        }),
      );
      await t.service.handle(press('E:lq:0:0'));
      expect(t.scores.save).toHaveBeenCalledWith('u1', {
        kind: 'LISTENING',
        title: 'Café',
        score: 100,
        items: 1,
        attempted: 1,
        mistakes: 0,
      });
      expect(t.sent[0].text).toContain('درست');
    });

    it('adds several expenses without AI and warns about the budget', async () => {
      const t = setup('member', ['expenses']);
      t.db.telegramLink.findUnique.mockResolvedValue(
        linked({ kind: 'expense', at: Date.now() }),
      );
      await t.service.handle(message('نان ۵۰ هزار\nتاکسی 80000'));
      expect(t.expenses.createExpense).toHaveBeenNthCalledWith(1, 'u1', {
        title: 'نان',
        amount: 50000,
      });
      expect(t.expenses.createExpense).toHaveBeenNthCalledWith(2, 'u1', {
        title: 'تاکسی',
        amount: 80000,
      });
      expect(t.sent[0].text).toContain('بودجهٔ ماهانهٔ «خوراک» رد شد');
      expect(t.assistant.chat).not.toHaveBeenCalled();
    });

    it('planner: add a task for today and toggle a habit', async () => {
      const t = setup();
      t.db.telegramLink.findUnique.mockResolvedValue(
        linked({ kind: 'task', at: Date.now() }),
      );
      await t.service.handle(message('خرید شیر'));
      expect(t.tasks.create).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          title: 'خرید شیر',
          date: expect.any(String),
        }),
      );
      expect(JSON.stringify(t.sent[0].buttons)).toContain('d:t9');

      t.habits.get.mockResolvedValue({ id: 'h1', goal: 1, checkins: [] });
      await t.service.handle(press('hb:h1'));
      expect(t.habits.checkin).toHaveBeenCalledWith('u1', 'h1', {
        date: expect.any(String),
        value: 1,
      });
    });

    it('a menu tap drops the pending question', async () => {
      const t = setup();
      t.db.telegramLink.findUnique.mockResolvedValue(
        linked({ kind: 'weight', at: Date.now() }),
      );
      await t.service.handle(message('برنامه‌ریز'));
      expect(t.db.telegramLink.updateMany).toHaveBeenCalledWith({
        where: { chatId: 42n },
        data: { pending: expect.anything() },
      });
      expect(t.body.logWeight).not.toHaveBeenCalled();
      expect(t.sent[0].text).toContain('برنامه‌ریز');
    });

    it('parses expense lines', () => {
      expect(parseExpenseLines('coffee 120k\nrent: 12 million')).toEqual([
        { title: 'coffee', amount: 120000 },
        { title: 'rent', amount: 12000000 },
      ]);
      expect(parseExpenseLines('نان ۵۰٬۰۰۰ تومان')).toEqual([
        { title: 'نان', amount: 50000 },
      ]);
      expect(parseExpenseLines('دیروز کلی خرج کردم')).toBeNull();
      expect(parseExpenseLines('۵۰۰۰')).toBeNull();
    });
  });
});
