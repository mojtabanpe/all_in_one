import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  plainReply,
  summaryText,
  telegramCodeHash,
  TelegramService,
} from './telegram.service';

const env: Record<string, string> = {
  TELEGRAM_BOT_TOKEN: 'token',
  TELEGRAM_BOT_USERNAME: '@poshtetgarm_bot',
  TELEGRAM_WEBHOOK_SECRET: 'x'.repeat(32),
  APP_PUBLIC_URL: 'https://poshtetgarm.ir/app',
};
const config = { get: (key: string) => env[key] } as unknown as ConfigService;

function setup(membership: string | Error = 'member') {
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
    englishCard: { count: vi.fn(() => 0) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  const assistant = { chat: vi.fn() };
  const tasks = { filter: vi.fn(() => []), update: vi.fn() };
  const service = new TelegramService(
    db as never,
    config,
    assistant as never,
    tasks as never,
  );
  const api = (
    service as unknown as { api: { call: unknown; sendMessage: unknown } }
  ).api;
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
  return { service, db, assistant, tasks, sent, calls };
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
});
