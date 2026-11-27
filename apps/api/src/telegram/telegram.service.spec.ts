import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { TelegramController } from './telegram.controller';
import {
  plainReply,
  reviewReminderText,
  summaryText,
  telegramCodeHash,
  TelegramService,
  MENU_VERSION,
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
  vpn?: {
    enabled: boolean;
    eligible: ReturnType<typeof vi.fn>;
    forChat: ReturnType<typeof vi.fn>;
  },
) {
  const sent: {
    chat: string;
    text: string;
    buttons?: unknown;
    entities?: unknown;
  }[] = [];
  const metricWrites: [string, string, string][] = [];
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
    telegramDailyCount: {
      findMany: vi.fn(async () => []),
    },
    englishCard: { count: vi.fn(() => 0), findFirst: vi.fn() },
    user: {
      findUnique: vi.fn(async () => ({ enabledApplets, role: 'CUSTOMER' })),
    },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
    $executeRaw: vi.fn(
      async (
        _strings: TemplateStringsArray,
        day: string,
        kind: string,
        entry: string,
      ) => {
        metricWrites.push([day, kind, entry]);
        return 1;
      },
    ),
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
    undefined,
    vpn as never,
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
    async (
      chat: bigint,
      text: string,
      buttons?: unknown,
      entities?: unknown,
    ) => {
      sent.push({
        chat: chat.toString(),
        text,
        buttons,
        ...(entities ? { entities } : {}),
      });
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
    metricWrites,
  };
}
const message = (text: string, id = 42) => ({
  message: { text, chat: { id, type: 'private' } },
});

describe('Telegram bot', () => {
  it('shows VPN only in the linked eligible chat and opens its own configuration', async () => {
    const vpn = {
      enabled: true,
      eligible: vi.fn().mockResolvedValue(true),
      forChat: vi.fn().mockResolvedValue({
        link: 'vless://test',
        quotaBytes: 50 * 1024 ** 3,
        remainingBytes: 22 * 1024 ** 3,
        expiresAt: Date.parse('2026-12-21T12:00:00Z'),
      }),
    };
    const t = setup('member', null, vpn);
    t.db.telegramLink.findUnique.mockResolvedValue({
      userId: 'u1',
      language: 'en',
      menuVersion: MENU_VERSION,
    });
    await t.service.handle(message('/start'));
    expect(JSON.stringify(t.sent.at(-1)?.buttons)).toContain('My VPN');
    await t.service.handle(message('My VPN'));
    expect(vpn.forChat).toHaveBeenCalledWith('u1', 42n);
    expect(t.sent.at(-1)?.text).toContain('22 of 50 GB');
    expect(t.sent.at(-1)?.text).toContain('vless://test');
    expect(t.sent.at(-1)?.buttons).toEqual([
      [{ text: 'Copy VPN configuration', copy_text: { text: 'vless://test' } }],
    ]);

    const longLink = 'vless://' + 'a'.repeat(249);
    vpn.forChat.mockResolvedValueOnce({
      link: longLink,
      quotaBytes: 50 * 1024 ** 3,
      remainingBytes: 22 * 1024 ** 3,
      expiresAt: Date.parse('2026-12-21T12:00:00Z'),
    });
    await t.service.handle(message('My VPN'));
    const longReply = t.sent.at(-1);
    expect(longReply?.buttons).toBeUndefined();
    expect(longReply?.text.endsWith(longLink)).toBe(true);
    expect(longReply?.entities).toEqual([
      {
        type: 'code',
        offset: longReply?.text.indexOf(longLink),
        length: longLink.length,
      },
    ]);

    vpn.eligible.mockResolvedValue(false);
    vpn.forChat.mockResolvedValue(null);
    t.db.telegramLink.findUnique.mockResolvedValue({
      userId: 'u1',
      language: 'en',
      menuVersion: MENU_VERSION,
      vpnMenuVisible: true,
    });
    await t.service.handle(message('My VPN'));
    expect(JSON.stringify(t.sent.at(-2)?.buttons)).not.toContain('My VPN');
    expect(t.sent.at(-1)?.text).toBe('VPN is unavailable for this account.');
  });

  it('creates a one-time link and stores only the hash', async () => {
    const { service, db } = setup();
    const { url } = await service.createLink('u1', 'fa');
    const code = /start=([A-Za-z0-9_-]+)$/.exec(url)?.[1] as string;
    expect(url.startsWith('https://t.me/poshtetgarm_bot?start=')).toBe(true);
    const stored = db.telegramLinkCode.create.mock.calls[0][0].data;
    expect(stored.codeHash).toBe(telegramCodeHash(code));
    expect(JSON.stringify(stored)).not.toContain(code);
  });

  it('hides the bot for the Myket store build and keeps it for others (199)', async () => {
    const { service, db } = setup();
    db.telegramLink.findUnique.mockResolvedValue(null);
    expect(await service.status('u1', 'myket')).toEqual({
      available: false,
      linked: false,
    });
    expect(await service.status('u1', 'bazaar')).toEqual({
      available: true,
      linked: false,
    });
    expect(await service.status('u1')).toEqual({
      available: true,
      linked: false,
    });
    await expect(service.createLink('u1', 'fa', 'myket')).rejects.toThrow();
    expect(db.telegramLinkCode.create).not.toHaveBeenCalled();
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
      data: {
        userId: 'u1',
        chatId: 42n,
        language: 'fa',
        menuVersion: MENU_VERSION,
      },
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
          [{ text: '📋 کارهای امروز' }, { text: '➕ کار جدید' }],
          [{ text: '🗓 برنامه‌ریز' }, { text: '🔤 زبان' }],
          [{ text: '🥗 سلامت' }],
          [{ text: '❓ راهنما' }],
        ],
      });
      t.db.telegramLink.findUnique.mockResolvedValue(linked);
      await t.service.handle(message('❓ راهنما'));
      expect(t.sent[1].text).toContain('سلامت');
      expect(t.assistant.chat).not.toHaveBeenCalled();
    });

    it('a chat with an older keyboard gets the new one once, then carries on', async () => {
      const t = setup();
      t.db.telegramLink.findUnique.mockResolvedValue({
        ...linked,
        menuVersion: 1,
      });
      // An old keyboard's label without an icon still works.
      await t.service.handle(message('کارهای امروز'));
      expect(t.db.telegramLink.updateMany).toHaveBeenCalledWith({
        where: { chatId: 42n },
        data: { menuVersion: MENU_VERSION },
      });
      expect(t.sent[0].text).toContain('منوی ربات به‌روز شد');
      expect(JSON.stringify(t.sent[0].buttons)).toContain('➕ کار جدید');
      expect(t.sent[1].text).toContain('کار باز');
    });

    it('«➕ کار جدید» asks for the task like the planner section', async () => {
      const t = setup();
      t.db.telegramLink.findUnique.mockResolvedValue(linked);
      await t.service.handle(message('➕ کار جدید'));
      expect(t.db.telegramLink.updateMany).toHaveBeenCalledWith({
        where: { chatId: 42n },
        data: { pending: expect.objectContaining({ kind: 'task' }) },
      });
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

    it('a counted habit (4 glasses of water) adds one per tap and − takes one back', async () => {
      const t = setup();
      t.db.telegramLink.findUnique.mockResolvedValue(linked());
      const today = new Date().toLocaleDateString('en-CA', {
        timeZone: 'Asia/Tehran',
      });
      t.habits.get.mockResolvedValue({
        id: 'h2',
        goal: 4,
        checkins: [{ date: today, value: 2 }],
      });
      await t.service.handle(press('hb:h2'));
      expect(t.habits.checkin).toHaveBeenLastCalledWith('u1', 'h2', {
        date: today,
        value: 3,
      });
      await t.service.handle(press('hm:h2'));
      expect(t.habits.checkin).toHaveBeenLastCalledWith('u1', 'h2', {
        date: today,
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

  describe('Telegram week checked by the bot (directive 189)', () => {
    const withBilling = (membership: string | Error) => {
      const ctx = setup(membership);
      const billing = {
        grantSocialWeek: vi.fn(async () => 'granted' as const),
      };
      (ctx.service as unknown as { billing: unknown }).billing = billing;
      ctx.db.telegramLink.findUnique.mockResolvedValue({ chatId: 42n });
      return { ...ctx, billing };
    };

    it('grants the week to a linked channel member', async () => {
      const { service, billing } = withBilling('member');
      expect(await service.claimChannelWeek('u1')).toBe('granted');
      expect(billing.grantSocialWeek).toHaveBeenCalledWith(
        'u1',
        'TELEGRAM_JOIN',
        expect.any(Date),
      );
    });

    it('never grants when the member is gone or the channel cannot be read', async () => {
      const left = withBilling('left');
      expect(await left.service.claimChannelWeek('u1')).toBe('not_member');
      const unreadable = withBilling(new Error('not admin'));
      expect(await unreadable.service.claimChannelWeek('u1')).toBe(
        'unavailable',
      );
      expect(left.billing.grantSocialWeek).not.toHaveBeenCalled();
      expect(unreadable.billing.grantSocialWeek).not.toHaveBeenCalled();
    });

    it('asks an unlinked account to link first', async () => {
      const { service, db } = withBilling('member');
      db.telegramLink.findUnique.mockResolvedValue(null);
      expect(await service.claimChannelWeek('u1')).toBe('not_linked');
    });
  });

  describe('English review reminder and link entry (PG-012)', () => {
    it('stores optional entry on one-time link codes and blocks Myket (199)', async () => {
      const { service, db } = setup();
      const controller = new TelegramController(service);

      await controller.link(
        { id: 'u1' } as never,
        { language: 'fa', entry: 'review_end' },
        'Mozilla/5.0 PoshtetgarmStore/bazaar',
      );
      expect(db.telegramLinkCode.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          language: 'fa',
          entry: 'review_end',
        }),
      });

      await controller.link(
        { id: 'u2' } as never,
        { language: 'en', entry: 'notify_failed' },
        'Mozilla/5.0',
      );
      expect(db.telegramLinkCode.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining({
          userId: 'u2',
          language: 'en',
          entry: 'notify_failed',
        }),
      });

      await expect(
        controller.link(
          { id: 'u3' } as never,
          { language: 'fa', entry: 'notify_failed' },
          'Mozilla/5.0 PoshtetgarmStore/myket',
        ),
      ).rejects.toThrow();
      expect(db.telegramLinkCode.create).toHaveBeenCalledTimes(2);
    });

    it('counts successful links by entry without personal data and skips test/staff or consumed codes', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-27T16:00:00Z'));
      try {
        const t = setup();
        t.db.telegramLink.findUnique.mockResolvedValue(null);
        t.db.telegramLinkCode.findUnique.mockResolvedValueOnce({
          userId: 'u1',
          language: 'fa',
          entry: 'notify_failed',
          expiresAt: new Date('2026-11-27T16:05:00Z'),
        });
        await t.service.handle(message('/start abcdefghijklmnopqrstuvwx'));
        expect(t.metricWrites).toEqual([
          ['2026-11-27', 'linked', 'notify_failed'],
        ]);

        // Double-tap / already consumed code neither links again nor increments.
        t.db.telegramLinkCode.findUnique.mockResolvedValueOnce({
          userId: 'u1',
          language: 'fa',
          entry: 'notify_failed',
          expiresAt: new Date('2026-11-27T16:05:00Z'),
        });
        t.db.telegramLinkCode.deleteMany.mockResolvedValueOnce({
          count: 0,
        } as never);
        await t.service.handle(message('/start abcdefghijklmnopqrstuvwx'));
        expect(t.metricWrites).toHaveLength(1);

        // Reserved test email and ADMIN accounts still link normally, without inflating aggregate counts.
        t.db.user.findUnique.mockResolvedValueOnce({
          enabledApplets: null,
          role: 'CUSTOMER',
          email: 'qa-check@example.invalid',
        } as never);
        t.db.telegramLinkCode.findUnique.mockResolvedValueOnce({
          userId: 'u-test',
          language: 'en',
          entry: 'review_end',
          expiresAt: new Date('2026-11-27T16:05:00Z'),
        });
        await t.service.handle(message('/start abcdefghijklmnopqrstuvwy'));
        expect(t.metricWrites).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('sends the 20:00 Tehran reminder once per day, recovers after restart, and retries on transient send error', async () => {
      const t = setup();
      const link = {
        userId: 'u1',
        chatId: 42n,
        language: 'fa',
        lastSummaryDay: '2026-11-27',
        lastReviewReminderDay: null as string | null,
        user: {
          role: 'CUSTOMER',
          email: null,
          signupSource: null,
          reviewReminder: null,
        },
      };
      t.db.telegramLink.findMany.mockImplementation(
        async (args?: { where?: unknown }) =>
          JSON.stringify(args?.where ?? '').includes('lastSummaryDay')
            ? []
            : link.lastReviewReminderDay === '2026-11-27'
              ? []
              : [link],
      );
      t.db.englishCard.count.mockResolvedValue(5 as never);

      // 19:59 Tehran (16:29 UTC): before default 20:00 -> nothing sent.
      await t.service.tick(new Date('2026-11-27T16:29:00Z'));
      expect(t.sent).toHaveLength(0);

      // Transient send failure at 20:00 rolls back lastReviewReminderDay and does not count.
      const api = (
        t.service as unknown as {
          api: { sendMessage: ReturnType<typeof vi.fn> };
        }
      ).api;
      api.sendMessage.mockRejectedValueOnce(new Error('relay timeout'));
      await t.service.tick(new Date('2026-11-27T16:30:00Z'));
      expect(t.sent).toHaveLength(0);
      expect(t.metricWrites).toHaveLength(0);
      expect(t.db.telegramLink.updateMany).toHaveBeenLastCalledWith({
        where: { userId: 'u1', lastReviewReminderDay: '2026-11-27' },
        data: { lastReviewReminderDay: null },
      });

      // Restart recovery later the same Tehran day (21:45 Tehran = 18:15 UTC) delivers once.
      t.db.telegramLink.updateMany.mockImplementationOnce(async () => {
        link.lastReviewReminderDay = '2026-11-27';
        return { count: 1 };
      });
      await t.service.tick(new Date('2026-11-27T18:15:00Z'));
      expect(t.sent).toHaveLength(1);
      expect(t.sent[0]).toEqual({
        chat: '42',
        text: '۵ کارت آمادهٔ مرور داری.',
        buttons: [[{ text: 'شروع مرور', callback_data: 'E:cd:all' }]],
      });
      expect(t.metricWrites).toEqual([['2026-11-27', 'reminder_sent', '']]);

      // Subsequent sweep on the same day sends nothing.
      await t.service.tick(new Date('2026-11-27T19:00:00Z'));
      expect(t.sent).toHaveLength(1);
      expect(t.metricWrites).toHaveLength(1);
    });

    it('sends nothing when cards due is 0, reminder setting is off, or user left the channel', async () => {
      const dueTime = new Date('2026-11-27T16:35:00Z'); // 20:05 Tehran

      // 1) 0 due cards -> silent, no claim
      const noCards = setup('member');
      noCards.db.telegramLink.findMany.mockImplementation(
        async (args?: { where?: unknown }) =>
          JSON.stringify(args?.where ?? '').includes('lastSummaryDay')
            ? []
            : [
                {
                  userId: 'u1',
                  chatId: 42n,
                  language: 'fa',
                  lastReviewReminderDay: null,
                  user: { reviewReminder: null },
                },
              ],
      );
      noCards.db.englishCard.count.mockResolvedValue(0 as never);
      await noCards.service.tick(dueTime);
      expect(noCards.sent).toHaveLength(0);
      expect(noCards.db.telegramLink.updateMany).not.toHaveBeenCalled();

      // 2) Setting disabled -> silent, does not even count cards
      const disabled = setup('member');
      disabled.db.telegramLink.findMany.mockImplementation(
        async (args?: { where?: unknown }) =>
          JSON.stringify(args?.where ?? '').includes('lastSummaryDay')
            ? []
            : [
                {
                  userId: 'u1',
                  chatId: 42n,
                  language: 'fa',
                  lastReviewReminderDay: null,
                  user: { reviewReminder: { enabled: false, time: '20:00' } },
                },
              ],
      );
      disabled.db.englishCard.count.mockResolvedValue(4 as never);
      await disabled.service.tick(dueTime);
      expect(disabled.sent).toHaveLength(0);
      expect(disabled.db.englishCard.count).not.toHaveBeenCalled();

      // 3) Non-member -> silent, no claim
      const left = setup('left');
      left.db.telegramLink.findMany.mockImplementation(
        async (args?: { where?: unknown }) =>
          JSON.stringify(args?.where ?? '').includes('lastSummaryDay')
            ? []
            : [
                {
                  userId: 'u1',
                  chatId: 42n,
                  language: 'fa',
                  lastReviewReminderDay: null,
                  user: { reviewReminder: { enabled: true, time: '20:00' } },
                },
              ],
      );
      left.db.englishCard.count.mockResolvedValue(4 as never);
      await left.service.tick(dueTime);
      expect(left.sent).toHaveLength(0);
      expect(left.db.telegramLink.updateMany).not.toHaveBeenCalled();
    });

    it('formats English reminders and tapping the inline button starts the existing card review', async () => {
      expect(reviewReminderText('fa', 0)).toBeNull();
      expect(reviewReminderText('en', 1)).toBe(
        'You have 1 card ready to review.',
      );
      expect(reviewReminderText('en', 3)).toBe(
        'You have 3 cards ready to review.',
      );

      const t = setup('member');
      t.db.telegramLink.findMany.mockImplementation(
        async (args?: { where?: unknown }) =>
          JSON.stringify(args?.where ?? '').includes('lastSummaryDay')
            ? []
            : [
                {
                  userId: 'u1',
                  chatId: 42n,
                  language: 'en',
                  lastReviewReminderDay: null,
                  user: { reviewReminder: { enabled: true, time: '21:00' } },
                },
              ],
      );
      t.db.englishCard.count.mockResolvedValue(1 as never);
      await t.service.tick(new Date('2026-11-27T17:30:00Z')); // 21:00 Tehran
      expect(t.sent[0]).toEqual({
        chat: '42',
        text: 'You have 1 card ready to review.',
        buttons: [[{ text: 'Start review', callback_data: 'E:cd:all' }]],
      });

      const cardId = '22222222-2222-4222-8222-222222222222';
      const callbackData = (
        t.sent[0].buttons as { text: string; callback_data: string }[][]
      )[0][0].callback_data;
      t.db.telegramLink.findUnique.mockResolvedValue({
        userId: 'u1',
        chatId: 42n,
        language: 'en',
        menuVersion: MENU_VERSION,
        pending: null,
      });
      t.db.englishCard.findFirst.mockResolvedValue({
        id: cardId,
        front: 'resilient',
        unit: '',
      });
      await t.service.handle({
        callback_query: {
          id: 'q-rem',
          data: callbackData,
          message: { chat: { id: 42 } },
        },
      });
      expect(t.sent[1].text).toContain('resilient');
      expect(JSON.stringify(t.sent[1].buttons)).toContain(`c:a:${cardId}:a`);
    });
  });
});
