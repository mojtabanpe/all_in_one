import {
  HttpException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import { PrismaService } from '@all-in-one/api/db';
import { TasksService } from '@all-in-one/applets/planner/api';
import { isoDateIn, zonedInstant } from '@all-in-one/applets/planner/contracts';
import {
  DAILY_TASKS_DEFAULT_TIME,
  type TelegramStatus,
} from '@all-in-one/shared/schemas';
import { AssistantService } from '../assistant/assistant.service';
import {
  TelegramApi,
  TelegramError,
  type TelegramButton,
} from './telegram-api';

const CODE_TTL_MS = 10 * 60_000;
/** The morning summary is due from the chosen time for three hours, like the push digest (154). */
const SUMMARY_WINDOW_MS = 3 * 3_600_000;
const SUMMARY_TASKS = 5;
type Lang = 'fa' | 'en';

export const telegramCodeHash = (code: string) =>
  createHash('sha256').update(code).digest('hex');

/** Telegram text is plain: drop the assistant's markdown bold and headings. */
export function plainReply(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

/** The open tasks and due cards of a morning summary, or null when the day has nothing. */
export function summaryText(
  language: Lang,
  tasks: { title: string }[],
  cards: number,
): string | null {
  if (!tasks.length && !cards) return null;
  const n = (value: number) =>
    language === 'en' ? String(value) : value.toLocaleString('fa-IR');
  const lines: string[] = [];
  if (tasks.length) {
    lines.push(
      language === 'en'
        ? `Today: ${n(tasks.length)} open task${tasks.length === 1 ? '' : 's'}`
        : `امروز ${n(tasks.length)} کار باز داری`,
    );
    for (const task of tasks.slice(0, SUMMARY_TASKS))
      lines.push(`• ${task.title}`);
    if (tasks.length > SUMMARY_TASKS)
      lines.push(
        language === 'en'
          ? `and ${n(tasks.length - SUMMARY_TASKS)} more`
          : `و ${n(tasks.length - SUMMARY_TASKS)} کار دیگر`,
      );
  }
  if (cards)
    lines.push(
      language === 'en'
        ? `${n(cards)} card${cards === 1 ? '' : 's'} ready to review`
        : `${n(cards)} کارت آمادهٔ مرور`,
    );
  return lines.join('\n');
}

interface TelegramUpdate {
  message?: {
    text?: string;
    chat: { id: number; type: string };
    from?: { language_code?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number } };
  };
}

/**
 * Telegram bot (directive 168): link an account with a one-time `/start` code, a morning summary of today's tasks
 * and due cards, and logging by message through the assistant (its tools, scope check and daily limits). Accounts
 * without AI access get a «subscription needed» reply instead.
 */
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly api: TelegramApi;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly assistant: AssistantService,
    private readonly tasks: TasksService,
  ) {
    this.api = new TelegramApi(config);
  }

  private get username(): string | undefined {
    return (
      this.config.get<string>('TELEGRAM_BOT_USERNAME')?.replace(/^@/, '') ||
      undefined
    );
  }
  private get secret(): string | undefined {
    return this.config.get<string>('TELEGRAM_WEBHOOK_SECRET') || undefined;
  }
  get enabled(): boolean {
    return this.api.enabled && !!this.username && !!this.secret;
  }

  private appUrl(path: string): string {
    const base = (
      this.config.get<string>('APP_PUBLIC_URL') ||
      (this.config.get<string>('APP_ORIGINS') || 'http://localhost:4400').split(
        ',',
      )[0]
    )
      .trim()
      .replace(/\/+$/, '');
    return new URL(path.replace(/^\//, ''), `${base}/`).href;
  }

  onModuleInit() {
    if (!this.enabled) return;
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async status(userId: string): Promise<TelegramStatus> {
    const link = await this.db.telegramLink.findUnique({
      where: { userId },
      select: { userId: true },
    });
    return { available: this.enabled, linked: !!link };
  }

  /** A one-time `t.me` link; only the code's hash is stored and it expires in 10 minutes. */
  async createLink(userId: string, language: Lang): Promise<{ url: string }> {
    if (!this.enabled)
      throw new ServiceUnavailableException('ربات تلگرام فعال نیست.');
    const code = randomBytes(18).toString('base64url');
    await this.db.$transaction([
      this.db.telegramLinkCode.deleteMany({
        where: { OR: [{ userId }, { expiresAt: { lt: new Date() } }] },
      }),
      this.db.telegramLinkCode.create({
        data: {
          codeHash: telegramCodeHash(code),
          userId,
          language,
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
        },
      }),
    ]);
    return { url: `https://t.me/${this.username}?start=${code}` };
  }

  async unlink(userId: string): Promise<{ ok: true }> {
    await this.db.telegramLink.deleteMany({ where: { userId } });
    return { ok: true };
  }

  /** Webhook outside Nest's cookie CSRF (like MCP): Telegram proves itself with the secret token header. */
  mount(app: Express): void {
    app.post(
      '/api/telegram/webhook',
      rateLimit({ windowMs: 60_000, limit: 300 }),
      express.json({ limit: '256kb' }),
      (request, response) => {
        const given = Buffer.from(
          String(request.headers['x-telegram-bot-api-secret-token'] ?? ''),
        );
        const secret = Buffer.from(this.secret ?? '');
        if (
          !this.enabled ||
          given.length !== secret.length ||
          !timingSafeEqual(given, secret)
        ) {
          response.sendStatus(401);
          return;
        }
        // Answer at once: Telegram retries slow webhooks, and the assistant can take a while.
        response.sendStatus(200);
        void this.handle(request.body as TelegramUpdate).catch(() =>
          this.logger.warn('Telegram update failed'),
        );
      },
    );
  }

  async handle(update: TelegramUpdate): Promise<void> {
    if (update.callback_query) return this.callback(update.callback_query);
    const message = update.message;
    if (!message || message.chat.type !== 'private') return;
    const chatId = BigInt(message.chat.id);
    const text = message.text?.trim() ?? '';
    const link = await this.db.telegramLink.findUnique({ where: { chatId } });
    const language: Lang =
      link?.language === 'en' || (!link && message.from?.language_code === 'en')
        ? 'en'
        : 'fa';
    const say = (fa: string, en: string, buttons?: TelegramButton[][]) =>
      this.reply(chatId, language === 'en' ? en : fa, buttons);

    const start = /^\/start(?:\s+([A-Za-z0-9_-]{16,64}))?$/.exec(text);
    if (start) {
      if (start[1]) return this.link(chatId, start[1]);
      return link
        ? say(
            'حسابت وصل است. هر کاری داری بنویس تا ثبت کنم؛ هر صبح هم کارهای امروز را می‌فرستم.',
            'Your account is linked. Write anything you need to do and I will log it; each morning I send your day.',
          )
        : say(
            'برای وصل شدن، در اپ به «حساب کاربری» برو و «وصل به تلگرام» را بزن.',
            'To link, open «Account» in the app and tap «Connect Telegram».',
            [[{ text: 'Poshtetgarm', url: this.appUrl('/account') }]],
          );
    }
    if (!link)
      return say(
        'اول حسابت را وصل کن: در اپ به «حساب کاربری» برو و «وصل به تلگرام» را بزن.',
        'Link your account first: open «Account» in the app and tap «Connect Telegram».',
        [[{ text: 'Poshtetgarm', url: this.appUrl('/account') }]],
      );
    if (text === '/stop') {
      await this.db.telegramLink.deleteMany({ where: { chatId } });
      return say(
        'اتصال قطع شد. دیگر پیامی نمی‌فرستم.',
        'Unlinked. I will not send anything else.',
      );
    }
    if (!text)
      return say(
        'فعلاً فقط پیام متنی را ثبت می‌کنم.',
        'For now I only log text messages.',
      );
    await this.chat(link.userId, chatId, language, text.slice(0, 4000));
  }

  private async link(chatId: bigint, code: string) {
    const row = await this.db.telegramLinkCode.findUnique({
      where: { codeHash: telegramCodeHash(code) },
    });
    if (!row || row.expiresAt < new Date())
      return this.reply(
        chatId,
        'این لینک منقضی شده است. در اپ دوباره «وصل به تلگرام» را بزن.\nThis link has expired. Tap «Connect Telegram» in the app again.',
      );
    await this.db.$transaction([
      this.db.telegramLink.deleteMany({
        where: { OR: [{ chatId }, { userId: row.userId }] },
      }),
      this.db.telegramLink.create({
        data: { userId: row.userId, chatId, language: row.language },
      }),
      this.db.telegramLinkCode.deleteMany({ where: { userId: row.userId } }),
    ]);
    return this.reply(
      chatId,
      row.language === 'en'
        ? 'Linked. Write anything you need to do, for example «dentist tomorrow at 5», and I will log it. Each morning I send your tasks for the day. /stop unlinks.'
        : 'وصل شد. هر کاری داری بنویس، مثلاً «فردا ساعت ۵ دندانپزشکی»، تا ثبتش کنم. هر صبح هم کارهای امروز را می‌فرستم. برای قطع اتصال /stop را بفرست.',
    );
  }

  /** A message goes to the assistant with the account's own access, scope check and daily limits. */
  private async chat(
    userId: string,
    chatId: bigint,
    language: Lang,
    text: string,
  ) {
    void this.api
      .call('sendChatAction', { chat_id: chatId.toString(), action: 'typing' })
      .catch(() => undefined);
    try {
      const reply = await this.assistant.chat(userId, {
        language,
        messages: [{ role: 'user', content: text }],
      });
      await this.reply(chatId, plainReply(reply.reply));
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 0;
      if (status === 402)
        return this.reply(
          chatId,
          language === 'en'
            ? 'Logging by message needs a subscription. Your trial and earned weeks have ended.'
            : 'ثبت با پیام به اشتراک نیاز دارد. دورهٔ آزمایشی و هفته‌های هدیه‌ات تمام شده است.',
          [
            [
              {
                text: language === 'en' ? 'Plans' : 'پلن‌ها',
                url: this.appUrl('/billing'),
              },
            ],
          ],
        );
      if (status === 429)
        return this.reply(
          chatId,
          language === 'en'
            ? "Today's AI limit is used up. Try again tomorrow."
            : 'سقف هوش مصنوعی امروز پر شده است. فردا دوباره بفرست.',
        );
      this.logger.warn(`Telegram assistant failed (${status || 'error'})`);
      return this.reply(
        chatId,
        language === 'en'
          ? 'Could not log that. Try again in a minute.'
          : 'ثبت نشد. یک دقیقهٔ دیگر دوباره بفرست.',
      );
    }
  }

  private async callback(query: NonNullable<TelegramUpdate['callback_query']>) {
    const answer = (text: string) =>
      this.api
        .call('answerCallbackQuery', { callback_query_id: query.id, text })
        .catch(() => undefined);
    const chat = query.message?.chat.id;
    const taskId = /^d:(.{1,60})$/.exec(query.data ?? '')?.[1];
    if (chat === undefined || !taskId) return void (await answer(''));
    const link = await this.db.telegramLink.findUnique({
      where: { chatId: BigInt(chat) },
    });
    if (!link) return void (await answer(''));
    try {
      await this.tasks.update(link.userId, taskId, { done: true });
      await answer(link.language === 'en' ? 'Done' : 'انجام شد');
    } catch {
      await answer(link.language === 'en' ? 'Not saved' : 'ثبت نشد');
    }
  }

  private async reply(
    chatId: bigint,
    text: string,
    buttons?: TelegramButton[][],
  ) {
    try {
      await this.api.sendMessage(chatId, text, buttons);
    } catch (error) {
      if (error instanceof TelegramError && error.gone)
        await this.db.telegramLink.deleteMany({ where: { chatId } });
      else this.logger.warn('Telegram send failed');
    }
  }

  /** Morning summary at the account's digest time (10:00 by default), once a Tehran day, only when there is something. */
  async tick(now = new Date()): Promise<void> {
    if (this.running || !this.enabled) return;
    this.running = true;
    try {
      const today = isoDateIn(now, 'Asia/Tehran');
      const links = await this.db.telegramLink.findMany({
        where: {
          OR: [{ lastSummaryDay: null }, { lastSummaryDay: { not: today } }],
        },
        include: {
          user: {
            select: {
              progressNotification: { select: { dailyTasksTime: true } },
            },
          },
        },
      });
      for (const link of links) {
        const time =
          link.user.progressNotification?.dailyTasksTime ??
          DAILY_TASKS_DEFAULT_TIME;
        const due = zonedInstant(today, time, 'Asia/Tehran')?.getTime();
        if (
          due === undefined ||
          now.getTime() < due ||
          now.getTime() >= due + SUMMARY_WINDOW_MS
        )
          continue;
        const claimed = await this.db.telegramLink.updateMany({
          where: { userId: link.userId, lastSummaryDay: link.lastSummaryDay },
          data: { lastSummaryDay: today },
        });
        if (!claimed.count) continue;
        try {
          await this.summary(
            link.userId,
            link.chatId,
            link.language,
            today,
            now,
          );
        } catch {
          this.logger.warn('Telegram summary failed');
        }
      }
    } catch {
      this.logger.error('Telegram summary sweep failed');
    } finally {
      this.running = false;
    }
  }

  private async summary(
    userId: string,
    chatId: bigint,
    lang: string,
    today: string,
    now: Date,
  ) {
    const language: Lang = lang === 'en' ? 'en' : 'fa';
    const open = (
      await this.tasks.filter(
        userId,
        { from: today, to: today, status: 'open' },
        true,
      )
    ).filter((task) => task.kind === 'TASK');
    const cards = await this.db.englishCard.count({
      where: {
        userId,
        suspended: false,
        dueAt: { lte: now },
        deck: { userId },
      },
    });
    const text = summaryText(language, open, cards);
    if (!text) return;
    const buttons: TelegramButton[][] = open
      .slice(0, SUMMARY_TASKS)
      .filter((task) => `d:${task.id}`.length <= 64)
      .map((task) => [
        { text: `✓ ${task.title}`.slice(0, 60), callback_data: `d:${task.id}` },
      ]);
    buttons.push([
      {
        text: language === 'en' ? 'Open the app' : 'باز کردن اپ',
        url: this.appUrl(open.length ? '/planner' : '/english'),
      },
    ]);
    await this.reply(chatId, text, buttons);
  }
}
