import {
  HttpException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrivateVpnService } from '../vpn/private-vpn.service';
import { BillingService } from '../billing/billing.service';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Prisma, PrismaService } from '@all-in-one/api/db';
import { TasksService } from '@all-in-one/applets/planner/api';
import {
  addDays,
  isoDateIn,
  zonedInstant,
} from '@all-in-one/applets/planner/contracts';
import {
  DAILY_TASKS_DEFAULT_TIME,
  DEFAULT_CUSTOMER_APPLETS,
  GROWTH_QA_SOURCES,
  isReservedTestEmail,
  type AppApplet,
  type TelegramLinkEntry,
  type TelegramRewardCheck,
  type TelegramStatus,
} from '@all-in-one/shared/schemas';
import { AiGateway, MAX_RECORDING_BYTES } from '@all-in-one/api/ai';
import {
  EnglishAiService,
  PracticeScoresService,
  SpeechService,
} from '@all-in-one/applets/english-learning/api';
import {
  CONVERSATION_SITUATIONS,
  checkShadowing,
  shadowSessionScore,
} from '@all-in-one/applets/english-learning/contracts';
import { AssistantService } from '../assistant/assistant.service';
import {
  TelegramApi,
  TelegramError,
  type TelegramButton,
  type TelegramCodeEntity,
  type TelegramMarkup,
} from './telegram-api';
import {
  formatDay,
  formatTime,
  num,
  plainReply,
  type Lang,
} from './telegram-format';
import {
  activePending,
  callbackSection,
  TelegramSectionsService,
  type Out,
  type SectionContext,
} from './telegram-sections';

export { plainReply } from './telegram-format';

const CODE_TTL_MS = 10 * 60_000;
/** The morning summary is due from the chosen time for three hours, like the push digest (154). */
const SUMMARY_WINDOW_MS = 3 * 3_600_000;
const SUMMARY_TASKS = 5;
/** Default evening review reminder time when `review_reminder_settings` has no row (matches `PushService.reviewSettings`). */
export const REVIEW_REMINDER_DEFAULT_TIME = '20:00';
/** Same 5-minute midnight grace for yesterday's reminder as `PushService` (directive 72). */
const REVIEW_MIDNIGHT_GRACE_MS = 5 * 60_000;

/** Labels of the reply keyboard (directive 172); a tap sends the label as a message. */
export const MENU_LABELS = {
  planner: { fa: 'برنامه‌ریز', en: 'Planner' },
  english: { fa: 'زبان', en: 'English' },
  health: { fa: 'سلامت', en: 'Health' },
  expenses: { fa: 'مخارج', en: 'Expenses' },
  today: { fa: 'کارهای امروز', en: "Today's tasks" },
  newTask: { fa: 'کار جدید', en: 'New task' },
  /** Kept for keyboards sent before directive 174. */
  shadow: { fa: 'شادوینگ', en: 'Shadowing' },
  vpn: { fa: 'وی‌پی‌ان من', en: 'My VPN' },
  help: { fa: 'راهنما', en: 'Help' },
} as const;
const SECTIONS: readonly AppApplet[] = [
  'planner',
  'english',
  'health',
  'expenses',
];
/** An icon in front of each button, so the menu is quick to scan (the text alone still works when typed). */
const MENU_ICONS: Partial<Record<keyof typeof MENU_LABELS, string>> = {
  today: '📋',
  newTask: '➕',
  planner: '🗓',
  english: '🔤',
  health: '🥗',
  expenses: '💰',
  help: '❓',
};
/**
 * Raised when the keyboard changes: a chat whose saved version is lower gets the new keyboard on its next message
 * or button, since Telegram keeps showing the last keyboard the bot sent.
 */
export const MENU_VERSION = 2;
const button = (key: keyof typeof MENU_LABELS, language: Lang) => ({
  text: `${MENU_ICONS[key] ? `${MENU_ICONS[key]} ` : ''}${MENU_LABELS[key][language]}`,
});
/** Matches a label with or without its icon (older keyboards had none). */
const isMenu = (text: string, key: keyof typeof MENU_LABELS) => {
  const plain = text.replace(/^[^\p{L}]+/u, '').trim();
  return plain === MENU_LABELS[key].fa || plain === MENU_LABELS[key].en;
};

/** The persistent buttons above the keyboard once the account is linked: the sections the account has on. */
export function menuKeyboard(
  language: Lang,
  applets: readonly AppApplet[] = DEFAULT_CUSTOMER_APPLETS,
  vpnVisible = false,
) {
  // Most used first: today's tasks and a new task; then the sections two by two; help last.
  const rows: { text: string }[][] = [
    [
      button('today', language),
      ...(applets.includes('planner') ? [button('newTask', language)] : []),
    ],
  ];
  const sections = SECTIONS.filter((section) => applets.includes(section)).map(
    (section) => button(section, language),
  );
  for (let i = 0; i < sections.length; i += 2)
    rows.push(sections.slice(i, i + 2));
  rows.push([
    ...(vpnVisible ? [button('vpn', language)] : []),
    button('help', language),
  ]);
  return {
    keyboard: rows,
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder:
      language === 'en'
        ? 'Write a task or a meal…'
        : 'کار یا وعده‌ات را بنویس…',
  };
}

export const HELP_TEXT = {
  fa: [
    'با این ربات:',
    '• هر کاری داری بنویس تا ثبت شود، مثلاً «فردا ساعت ۵ دندانپزشکی» یا «ناهار قرمه‌سبزی خوردم».',
    '• «برنامه‌ریز»: امروز، عقب‌افتاده‌ها، کار جدید و عادت‌ها.',
    '• «زبان»: مرور کارت‌ها، شادوینگ، شنیدن، نوشتن، صحبت و خواندن.',
    '• «سلامت»: کالری امروز، ثبت وعده، روزه، وزن و تمرین.',
    '• «مخارج»: ثبت هزینه، گزارش ماه و بودجه‌ها (اگر در حسابت روشن باشد).',
    '• هر صبح در ساعت خلاصهٔ حسابت، کارهای امروز را می‌فرستم.',
    '/stop اتصال را قطع می‌کند.',
  ].join('\n'),
  en: [
    'With this bot:',
    '• Write anything you need to do and it is logged, for example «dentist tomorrow at 5» or «had pasta for lunch».',
    '• «Planner»: today, overdue, new task and habits.',
    '• «English»: card review, shadowing, listening, writing, speaking and reading.',
    "• «Health»: today's calories, meals, fasting, weight and workouts.",
    '• «Expenses»: add expenses, month report and budgets (when it is on in your account).',
    "• Each morning, at your account's summary time, I send your tasks for the day.",
    '/stop unlinks.',
  ].join('\n'),
};

/** Telegram's Menu button: commands per language, and the bot's description before «Start». */
const COMMANDS = {
  fa: [
    { command: 'today', description: 'کارهای امروز' },
    { command: 'new', description: 'کار جدید' },
    { command: 'planner', description: 'برنامه‌ریز' },
    { command: 'english', description: 'زبان' },
    { command: 'health', description: 'سلامت' },
    { command: 'expenses', description: 'مخارج' },
    { command: 'shadow', description: 'تمرین شادوینگ' },
    { command: 'help', description: 'راهنما' },
    { command: 'stop', description: 'قطع اتصال' },
  ],
  en: [
    { command: 'today', description: "Today's tasks" },
    { command: 'new', description: 'New task' },
    { command: 'planner', description: 'Planner' },
    { command: 'english', description: 'English' },
    { command: 'health', description: 'Health' },
    { command: 'expenses', description: 'Expenses' },
    { command: 'shadow', description: 'Shadowing practice' },
    { command: 'help', description: 'Help' },
    { command: 'stop', description: 'Unlink' },
  ],
};
const DESCRIPTION = {
  fa: 'ربات Poshtetgarm: برنامه‌ریز، زبان، سلامت و مخارج اپ در تلگرام. کارهایت را با یک پیام ثبت کن و هر صبح کارهای امروز را بگیر. اول در اپ «حساب کاربری ← وصل به تلگرام» را بزن.',
  en: "Poshtetgarm bot: the app's planner, English, health and expenses in Telegram. Log things with one message and get your day each morning. First tap «Account → Connect Telegram» in the app.",
};
const SHORT_DESCRIPTION = {
  fa: 'برنامه‌ریز، زبان، سلامت و مخارج Poshtetgarm در تلگرام',
  en: 'Poshtetgarm planner, English, health and expenses in Telegram',
};
/** At most this many sentences of a generated dialogue are practised in Telegram. */
const SHADOW_SENTENCES = 8;

/** A shadowing practice running in a Telegram chat (`telegram_links.shadow`). */
export interface ShadowState {
  title: string;
  lines: string[];
  index: number;
  /** Latest check of each sentence; null until it is recorded. */
  scores: (number | null)[];
  mistakes: number;
}

/** The reply to one recorded sentence: its score and the words to fix. */
export function shadowFeedback(
  language: Lang,
  check: ReturnType<typeof checkShadowing>,
): string {
  const n = (value: number) =>
    language === 'en' ? String(value) : value.toLocaleString('fa-IR');
  const missed = check.words.filter((w) => w.status === 'missed');
  const wrong = check.words.filter((w) => w.status === 'wrong');
  const lines = [
    language === 'en'
      ? `Score: ${n(check.score)} / 100`
      : `امتیاز این جمله: ${n(check.score)} از ۱۰۰`,
  ];
  if (missed.length)
    lines.push(
      (language === 'en' ? 'Missed: ' : 'جاافتاده: ') +
        missed.map((w) => w.word).join(', '),
    );
  if (wrong.length)
    lines.push(
      (language === 'en' ? 'Wrong: ' : 'اشتباه: ') +
        wrong
          .map((w) =>
            w.heard
              ? `${w.word} (${language === 'en' ? 'heard' : 'شنیدم'} ${w.heard})`
              : w.word,
          )
          .join(', '),
    );
  if (check.extra.length)
    lines.push(
      (language === 'en' ? 'Extra: ' : 'اضافه: ') + check.extra.join(', '),
    );
  if (!check.heard.trim())
    lines.push(
      language === 'en'
        ? 'I could not hear any words. Record again, a little closer to the microphone.'
        : 'کلمه‌ای نشنیدم. دوباره ضبط کن، کمی نزدیک‌تر به میکروفون.',
    );
  return lines.join('\n');
}

export const telegramCodeHash = (code: string) =>
  createHash('sha256').update(code).digest('hex');

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

/** Daily English card-review reminder text in the link's language, or null when nothing is due (PG-012). */
export function reviewReminderText(
  language: Lang,
  cards: number,
): string | null {
  if (cards <= 0) return null;
  const count = num(language, cards);
  return language === 'en'
    ? `You have ${count} card${cards === 1 ? '' : 's'} ready to review.`
    : `${count} کارت آمادهٔ مرور داری.`;
}

interface TelegramUpdate {
  message?: {
    text?: string;
    voice?: { file_id: string; file_size?: number };
    audio?: { file_id: string; file_size?: number };
    chat: { id: number; type: string };
    from?: { id?: number; language_code?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: { id?: number };
    message?: { chat: { id: number } };
  };
}

/**
 * Telegram bot (directive 168): link an account with a one-time `/start` code, a morning summary of today's tasks
 * and due cards, and logging by message through the assistant (its tools, scope check and daily limits). Accounts
 * without AI access get a «subscription needed» reply instead. Using the bot requires membership of the main
 * channel (`TELEGRAM_REQUIRED_CHANNEL`, default `@poshtetgarm`, directive 170).
 */
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly api: TelegramApi;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private stopRewardListener?: () => void;

  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly assistant: AssistantService,
    private readonly tasks: TasksService,
    private readonly gateway: AiGateway,
    private readonly englishAi: EnglishAiService,
    private readonly speech: SpeechService,
    private readonly scores: PracticeScoresService,
    private readonly sections: TelegramSectionsService,
    @Optional() private readonly billing?: BillingService,
    @Optional() private readonly vpn?: PrivateVpnService,
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
  /** The channel users must join; an empty value turns the requirement off. */
  private get channel(): string {
    return (
      this.config.get<string>('TELEGRAM_REQUIRED_CHANNEL') ?? '@poshtetgarm'
    );
  }

  /**
   * Whether the Telegram user is a member of the required channel. Only a channel admin can read members, so while
   * the bot is not an admin (or Telegram is unreachable) the check lets the user through instead of locking everyone
   * out; it is logged so the setup can be fixed.
   */
  async member(telegramUserId: bigint | number): Promise<boolean> {
    return (await this.membership(telegramUserId)) !== 'not_member';
  }

  /** The channel check without the fallback: `unknown` when it cannot be read (never grants a reward). */
  async membership(
    telegramUserId: bigint | number,
  ): Promise<'member' | 'not_member' | 'unknown'> {
    if (!this.channel) return 'unknown';
    try {
      const result = await this.api.call<{
        status: string;
        is_member?: boolean;
      }>('getChatMember', {
        chat_id: this.channel,
        user_id: Number(telegramUserId),
      });
      return ['creator', 'administrator', 'member'].includes(result.status) ||
        (result.status === 'restricted' && result.is_member === true)
        ? 'member'
        : 'not_member';
    } catch (error) {
      this.logger.warn(
        `Channel membership check unavailable (${error instanceof TelegramError ? error.code : 'network'}); allowing`,
      );
      return 'unknown';
    }
  }

  /**
   * The Telegram week checked by the bot (directive 189): a linked account that is in the channel gets the week at
   * once, without sending a username and waiting for support. Unknown membership never grants.
   */
  async claimChannelWeek(
    userId: string,
    now = new Date(),
  ): Promise<TelegramRewardCheck> {
    if (!this.billing || !this.enabled) return 'unavailable';
    const link = await this.db.telegramLink.findUnique({
      where: { userId },
      select: { chatId: true },
    });
    if (!link) return 'not_linked';
    const membership = await this.membership(link.chatId);
    if (membership === 'not_member') return 'not_member';
    if (membership === 'unknown') return 'unavailable';
    const result = await this.billing.grantSocialWeek(
      userId,
      'TELEGRAM_JOIN',
      now,
    );
    return result === 'granted'
      ? 'granted'
      : result === 'exists'
        ? 'earned'
        : 'unavailable';
  }

  private joinPrompt(chatId: bigint, language: Lang, code?: string) {
    const channel = this.channel.replace(/^@/, '');
    return this.reply(
      chatId,
      language === 'en'
        ? `To use the bot, join the Poshtetgarm channel first (@${channel}), then tap «I joined».`
        : `برای استفاده از ربات، اول در کانال Poshtetgarm (@${channel}) عضو شو و بعد «عضو شدم» را بزن.`,
      [
        [
          {
            text: language === 'en' ? 'Join the channel' : 'عضویت در کانال',
            url: `https://t.me/${channel}`,
          },
        ],
        [
          {
            text: language === 'en' ? 'I joined' : 'عضو شدم',
            callback_data: code ? `j:${code}` : 'j',
          },
        ],
      ],
    );
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
    // A granted social week (by support or by the check above) is also said in the bot.
    this.stopRewardListener = this.billing?.onRewardGranted(
      (userId, campaign) => this.rewardMessage(userId, campaign),
    );
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
    void this.tick();
    void this.registerMenu();
  }

  /** Commands and descriptions in Persian (default) and English; failures only log. */
  async registerMenu() {
    try {
      for (const language of ['fa', 'en'] as const) {
        const scope = language === 'fa' ? {} : { language_code: 'en' };
        await this.api.call('setMyCommands', {
          commands: COMMANDS[language],
          ...scope,
        });
        await this.api.call('setMyDescription', {
          description: DESCRIPTION[language],
          ...scope,
        });
        await this.api.call('setMyShortDescription', {
          short_description: SHORT_DESCRIPTION[language],
          ...scope,
        });
      }
    } catch {
      this.logger.warn('Telegram menu registration failed');
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.stopRewardListener?.();
  }

  async status(userId: string): Promise<TelegramStatus> {
    const link = await this.db.telegramLink.findUnique({
      where: { userId },
      select: { userId: true },
    });
    return { available: this.enabled, linked: !!link };
  }

  /** A one-time `t.me` link; only the code's hash is stored and it expires in 10 minutes. */
  async createLink(
    userId: string,
    language: Lang,
    entry?: TelegramLinkEntry,
  ): Promise<{ url: string }> {
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
          ...(entry ? { entry } : {}),
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
    const say = (fa: string, en: string, markup?: TelegramMarkup) =>
      this.reply(chatId, language === 'en' ? en : fa, markup);

    const from = BigInt(message.from?.id ?? message.chat.id);
    const start = /^\/start(?:\s+([A-Za-z0-9_-]{16,60}))?$/.exec(text);
    if (start) {
      if (start[1])
        return (await this.member(from))
          ? this.link(chatId, start[1])
          : this.joinPrompt(chatId, language, start[1]);
      return link
        ? say(
            HELP_TEXT.fa,
            HELP_TEXT.en,
            await this.keyboard(link.userId, language),
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
        { remove_keyboard: true },
      );
    }
    if (!(await this.member(from))) return this.joinPrompt(chatId, language);
    await this.refreshMenu(link, chatId, language);
    const pending = activePending(link.pending);
    const ctx: SectionContext = {
      userId: link.userId,
      chatId,
      language,
      pending,
    };
    // A menu or command means the user moved on from a question the bot asked.
    const command = /^\/[a-z]+$/.test(text);
    const section = SECTIONS.find(
      (key) => text === `/${key}` || isMenu(text, key),
    );
    if (
      pending &&
      (command ||
        section ||
        isMenu(text, 'today') ||
        isMenu(text, 'newTask') ||
        isMenu(text, 'vpn') ||
        isMenu(text, 'help'))
    )
      await this.sections.savePending(chatId, null);
    if (text === '/help' || isMenu(text, 'help'))
      return say(
        HELP_TEXT.fa,
        HELP_TEXT.en,
        await this.keyboard(link.userId, language),
      );
    if (isMenu(text, 'vpn')) return this.sendVpn(link.userId, chatId, language);
    if (text === '/today' || isMenu(text, 'today'))
      return this.today(link.userId, chatId, language);
    if (text === '/new' || isMenu(text, 'newTask'))
      return this.run(
        ctx,
        async () => (await this.sections.callback('p:a', ctx))?.outs ?? [],
      );
    if (section) return this.run(ctx, () => this.sections.menu(section, ctx));
    if (text === '/shadow' || /^(شادوینگ|shadowing|shadow)$/i.test(text))
      return this.startShadow(link.userId, chatId, language);
    const voice = message.voice ?? message.audio;
    if (voice) {
      if (pending?.kind === 'speaking') {
        if ((voice.file_size ?? 0) > MAX_RECORDING_BYTES)
          return say(
            'این ضبط خیلی طولانی است. کوتاه‌تر جواب بده.',
            'That recording is too long. Answer a little shorter.',
          );
        return this.run(
          ctx,
          async () =>
            (await this.sections.voice(
              await this.api.download(voice.file_id, MAX_RECORDING_BYTES),
              ctx,
            )) ?? [],
        );
      }
      const state = link.shadow as ShadowState | null;
      if (state)
        return this.checkVoice(link.userId, chatId, language, state, voice);
      return say(
        'برای تمرین شادوینگ /shadow را بفرست؛ بعد هر جمله را بشنو و با پیام صوتی تکرار کن.',
        'Send /shadow to practise shadowing: listen to each sentence and repeat it in a voice message.',
      );
    }
    if (!text)
      return say(
        'فعلاً فقط پیام متنی را ثبت می‌کنم.',
        'For now I only log text messages.',
      );
    if (pending && pending.kind !== 'listening' && !command)
      return this.run(
        ctx,
        async () => (await this.sections.text(text.slice(0, 4000), ctx)) ?? [],
      );
    await this.chat(link.userId, chatId, language, text.slice(0, 4000));
  }

  /** A chat still showing an older keyboard gets the current one once (Telegram keeps the last one sent). */
  private async refreshMenu(
    link: {
      userId: string;
      menuVersion?: number | null;
      vpnMenuVisible?: boolean;
    },
    chatId: bigint,
    language: Lang,
  ) {
    // The column is never null in the database (default 0); a missing value is treated as current.
    const vpnVisible = (await this.vpn?.eligible(link.userId)) ?? false;
    if (
      (link.menuVersion ?? MENU_VERSION) >= MENU_VERSION &&
      (link.vpnMenuVisible ?? false) === vpnVisible
    )
      return;
    await this.db.telegramLink.updateMany({
      where: { chatId },
      data:
        this.vpn?.enabled || link.vpnMenuVisible
          ? { menuVersion: MENU_VERSION, vpnMenuVisible: vpnVisible }
          : { menuVersion: MENU_VERSION },
    });
    await this.reply(
      chatId,
      language === 'en' ? 'The bot menu is updated.' : 'منوی ربات به‌روز شد.',
      await this.keyboard(link.userId, language, vpnVisible),
    );
  }

  /** The reply keyboard with the sections this account has on. */
  private async keyboard(userId: string, language: Lang, vpnVisible?: boolean) {
    if (vpnVisible === undefined && this.vpn?.enabled) {
      vpnVisible = await this.vpn.eligible(userId);
      await this.db.telegramLink.updateMany({
        where: { userId, vpnMenuVisible: !vpnVisible },
        data: { vpnMenuVisible: vpnVisible },
      });
    }
    return menuKeyboard(
      language,
      await this.sections.applets(userId),
      vpnVisible,
    );
  }

  private async sendVpn(userId: string, chatId: bigint, language: Lang) {
    let access;
    try {
      access = await this.vpn?.forChat(userId, chatId);
    } catch {
      return this.reply(
        chatId,
        language === 'en'
          ? 'Your VPN is temporarily unavailable. Try again in a minute.'
          : 'وی‌پی‌ان موقتاً در دسترس نیست. یک دقیقه دیگر دوباره امتحان کن.',
      );
    }
    if (!access)
      return this.reply(
        chatId,
        language === 'en'
          ? 'VPN is unavailable for this account.'
          : 'وی‌پی‌ان برای این حساب در دسترس نیست.',
      );
    const gb = (bytes: number) => num(language, bytes / 1024 ** 3);
    const expires = new Date(access.expiresAt);
    const day = formatDay(language, isoDateIn(expires, 'Asia/Tehran'));
    const time = formatTime(language, expires);
    const summary =
      language === 'en'
        ? `Remaining: ${gb(access.remainingBytes)} of ${gb(access.quotaBytes)} GB\nExpires: ${day}, ${time} Tehran time`
        : `${gb(access.remainingBytes)} گیگابایت از ${gb(access.quotaBytes)} گیگابایت باقی مانده\nاعتبار تا ${day}، ساعت ${time} تهران`;
    const link = access.link;
    if (!link) {
      const depleted =
        language === 'en'
          ? 'Your VPN quota has been used up.'
          : 'حجم وی‌پی‌ان تمام شده است.';
      return this.reply(chatId, `${summary}\n\n${depleted}`);
    }

    const prefix = `${summary}\n\n`;
    const buttons =
      link.length <= 256
        ? [
            [
              {
                text:
                  language === 'en' ? 'Copy VPN configuration' : 'کپی کانفیگ',
                copy_text: { text: link },
              },
            ],
          ]
        : undefined;
    return this.reply(chatId, prefix + link, buttons, [
      { type: 'code', offset: prefix.length, length: link.length },
    ]);
  }

  /** Runs a section action and sends what it returns; AI and other errors get the usual replies. */
  private async run(ctx: SectionContext, action: () => Promise<Out[]>) {
    const ai = setTimeout(
      () =>
        void this.api
          .call('sendChatAction', {
            chat_id: ctx.chatId.toString(),
            action: 'typing',
          })
          .catch(() => undefined),
      800,
    );
    try {
      await this.send(ctx.chatId, await action());
    } catch (error) {
      await this.aiError(ctx.chatId, ctx.language, error);
    } finally {
      clearTimeout(ai);
    }
  }

  private async send(chatId: bigint, outs: Out[]) {
    for (const out of outs) {
      if ('text' in out) {
        await this.reply(chatId, out.text, out.markup);
        continue;
      }
      try {
        await this.api.sendVoice(chatId, out.voice, out.caption, out.buttons);
      } catch {
        await this.reply(chatId, out.caption, out.buttons);
      }
    }
  }

  private isCountableUser(
    user?: {
      role?: string | null;
      email?: string | null;
      signupSource?: string | null;
    } | null,
  ): boolean {
    if (!user || (user.role !== undefined && user.role !== 'CUSTOMER'))
      return false;
    if (isReservedTestEmail(user.email)) return false;
    if (
      user.signupSource &&
      (GROWTH_QA_SOURCES as readonly string[]).includes(
        user.signupSource.toLowerCase(),
      )
    )
      return false;
    return true;
  }

  private async isCountableCustomer(userId: string): Promise<boolean> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true, signupSource: true },
    });
    return this.isCountableUser(user);
  }

  private async incrementDailyCount(
    day: string,
    kind: 'linked' | 'reminder_sent',
    entry: TelegramLinkEntry | '' = '',
  ): Promise<void> {
    await this.db.$executeRaw`
      INSERT INTO "telegram_daily_counts" ("day", "kind", "entry", "count")
      VALUES (${day}, ${kind}, ${entry}, 1)
      ON CONFLICT ("day", "kind", "entry")
      DO UPDATE SET "count" = "telegram_daily_counts"."count" + 1
    `;
  }

  /** Aggregate daily Telegram link and review-reminder counts (no personal data). */
  async dailyCounts(from: string, to: string) {
    return this.db.telegramDailyCount.findMany({
      where: { day: { gte: from, lte: to } },
      orderBy: [{ day: 'asc' }, { kind: 'asc' }, { entry: 'asc' }],
    });
  }

  private async link(chatId: bigint, code: string, now = new Date()) {
    const codeHash = telegramCodeHash(code);
    const row = await this.db.telegramLinkCode.findUnique({
      where: { codeHash },
    });
    if (!row || row.expiresAt < now)
      return this.reply(
        chatId,
        'این لینک منقضی شده است. در اپ دوباره «وصل به تلگرام» را بزن.\nThis link has expired. Tap «Connect Telegram» in the app again.',
      );
    const consumed = await this.db.telegramLinkCode.deleteMany({
      where: { codeHash, expiresAt: { gte: now } },
    });
    if (consumed.count === 0)
      return this.reply(
        chatId,
        'این لینک منقضی شده است. در اپ دوباره «وصل به تلگرام» را بزن.\nThis link has expired. Tap «Connect Telegram» in the app again.',
      );
    await this.db.$transaction([
      this.db.telegramLink.deleteMany({
        where: { OR: [{ chatId }, { userId: row.userId }] },
      }),
      this.db.telegramLink.create({
        data: {
          userId: row.userId,
          chatId,
          language: row.language,
          menuVersion: MENU_VERSION,
        },
      }),
      this.db.telegramLinkCode.deleteMany({ where: { userId: row.userId } }),
    ]);
    const entry: TelegramLinkEntry | '' =
      row.entry === 'review_end' || row.entry === 'notify_failed'
        ? row.entry
        : '';
    if (await this.isCountableCustomer(row.userId)) {
      await this.incrementDailyCount(
        isoDateIn(now, 'Asia/Tehran'),
        'linked',
        entry,
      ).catch(() => this.logger.warn('Telegram link count failed'));
    }
    const language: Lang = row.language === 'en' ? 'en' : 'fa';
    await this.reply(
      chatId,
      `${language === 'en' ? 'Linked.' : 'وصل شد.'}\n\n${HELP_TEXT[language]}`,
      await this.keyboard(row.userId, language),
    );
    // Linking needs the channel (170), so the Telegram week usually follows at once (its message comes from the grant).
    await this.claimChannelWeek(row.userId).catch(() => undefined);
  }

  private async rewardMessage(userId: string, campaign: string) {
    const link = await this.db.telegramLink.findUnique({
      where: { userId },
      select: { chatId: true, language: true },
    });
    if (!link) return;
    const where =
      link.language === 'en'
        ? campaign === 'TELEGRAM_JOIN'
          ? 'Telegram'
          : 'Instagram'
        : campaign === 'TELEGRAM_JOIN'
          ? 'تلگرام'
          : 'اینستاگرام';
    await this.reply(
      link.chatId,
      link.language === 'en'
        ? `🎁 Your ${where} membership was confirmed: one week of AI was added to your Poshtetgarm plan.`
        : `🎁 عضویتت در ${where} تأیید شد و یک هفته هوش مصنوعی به اشتراک Poshtetgarm اضافه شد.`,
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
      await this.aiError(chatId, language, error);
    }
  }

  /** No AI access → plans link; daily limit → try tomorrow; anything else → try again. */
  private async aiError(chatId: bigint, language: Lang, error: unknown) {
    const status = error instanceof HttpException ? error.getStatus() : 0;
    if (status === 402)
      return this.reply(
        chatId,
        language === 'en'
          ? 'This needs a subscription. Your trial and earned weeks have ended.'
          : 'این کار به اشتراک نیاز دارد. دورهٔ آزمایشی و هفته‌های هدیه‌ات تمام شده است.',
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
    this.logger.warn(`Telegram AI request failed (${status || 'error'})`);
    return this.reply(
      chatId,
      language === 'en'
        ? 'That did not work. Try again in a minute.'
        : 'انجام نشد. یک دقیقهٔ دیگر دوباره بفرست.',
    );
  }

  private saveShadow(chatId: bigint, state: ShadowState | null) {
    return this.db.telegramLink.updateMany({
      where: { chatId },
      data: { shadow: state === null ? Prisma.DbNull : (state as object) },
    });
  }

  /** A fresh dialogue from the app's generator; its sentences are practised one by one. */
  private async startShadow(userId: string, chatId: bigint, language: Lang) {
    void this.api
      .call('sendChatAction', { chat_id: chatId.toString(), action: 'typing' })
      .catch(() => undefined);
    try {
      const situation =
        CONVERSATION_SITUATIONS[
          Math.floor(Math.random() * CONVERSATION_SITUATIONS.length)
        ].id;
      const dialogue = await this.englishAi.dialogue(userId, situation);
      const lines = dialogue.lines
        .map((line) => line.text.trim())
        .filter(Boolean)
        .slice(0, SHADOW_SENTENCES);
      if (!lines.length) throw new Error('empty dialogue');
      const state: ShadowState = {
        title: dialogue.title,
        lines,
        index: 0,
        scores: lines.map(() => null),
        mistakes: 0,
      };
      await this.saveShadow(chatId, state);
      await this.reply(
        chatId,
        language === 'en'
          ? `Shadowing: ${dialogue.title}\nListen to each sentence, then repeat it in a voice message.`
          : `شادوینگ: ${dialogue.title}\nهر جمله را بشنو و بعد با پیام صوتی تکرارش کن.`,
      );
      await this.sendSentence(userId, chatId, language, state);
    } catch (error) {
      await this.aiError(chatId, language, error);
    }
  }

  private shadowButtons(language: Lang): TelegramButton[][] {
    return [
      [
        {
          text: language === 'en' ? 'Listen again' : 'دوباره بشنو',
          callback_data: 's:r',
        },
        {
          text: language === 'en' ? 'Next' : 'جملهٔ بعد',
          callback_data: 's:n',
        },
      ],
      [{ text: language === 'en' ? 'Finish' : 'پایان', callback_data: 's:x' }],
    ];
  }

  /** The sentence as speech (the app's TTS and shared cache) with its text; text alone if speech is unavailable. */
  private async sendSentence(
    userId: string,
    chatId: bigint,
    language: Lang,
    state: ShadowState,
  ) {
    const sentence = state.lines[state.index];
    const n = (value: number) =>
      language === 'en' ? String(value) : value.toLocaleString('fa-IR');
    const caption = `${n(state.index + 1)}/${n(state.lines.length)}\n${sentence}`;
    try {
      const audio = await this.speech.speak(userId, sentence, 'primary');
      await this.api.sendVoice(
        chatId,
        { data: audio.audio, contentType: audio.contentType },
        caption,
        this.shadowButtons(language),
      );
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 0;
      if (status !== 402 && status !== 429)
        this.logger.warn(`Telegram shadow audio failed (${status || 'error'})`);
      await this.reply(
        chatId,
        `${caption}\n\n${
          language === 'en'
            ? 'Audio is not available now; read the sentence aloud and record it.'
            : 'صدای جمله الان در دسترس نیست؛ جمله را بلند بخوان و ضبط کن.'
        }`,
        this.shadowButtons(language),
      );
    }
  }

  /** A voice message: transcribe it, compare word by word, then move to the next sentence. */
  private async checkVoice(
    userId: string,
    chatId: bigint,
    language: Lang,
    state: ShadowState,
    voice: { file_id: string; file_size?: number },
  ) {
    if ((voice.file_size ?? 0) > MAX_RECORDING_BYTES)
      return this.reply(
        chatId,
        language === 'en'
          ? 'That recording is too long. Record just this sentence.'
          : 'این ضبط خیلی طولانی است. فقط همین جمله را ضبط کن.',
      );
    try {
      const audio = await this.api.download(voice.file_id, MAX_RECORDING_BYTES);
      const heard = await this.gateway.transcribe(userId, audio, 'audio/ogg');
      const check = checkShadowing(state.lines[state.index], heard);
      state.scores[state.index] = check.score;
      state.mistakes += check.words.filter((w) => w.status !== 'ok').length;
      await this.reply(chatId, shadowFeedback(language, check));
      await this.advance(userId, chatId, language, state);
    } catch (error) {
      await this.aiError(chatId, language, error);
    }
  }

  private async advance(
    userId: string,
    chatId: bigint,
    language: Lang,
    state: ShadowState,
  ) {
    if (state.index + 1 >= state.lines.length)
      return this.finishShadow(userId, chatId, language, state);
    state.index += 1;
    await this.saveShadow(chatId, state);
    await this.sendSentence(userId, chatId, language, state);
  }

  /** Session score (unrecorded sentences count 0), saved with the app's practice scores. */
  private async finishShadow(
    userId: string,
    chatId: bigint,
    language: Lang,
    state: ShadowState,
  ) {
    await this.saveShadow(chatId, null);
    const recorded = state.scores.filter((x) => x !== null).length;
    if (!recorded)
      return this.reply(
        chatId,
        language === 'en'
          ? 'Practice ended without a recording.'
          : 'تمرین بدون ضبط تمام شد.',
      );
    const score = shadowSessionScore(
      state.lines.length,
      state.scores.map((x) => x ?? undefined),
    );
    await this.scores.save(userId, {
      kind: 'SHADOWING',
      title: state.title.slice(0, 200),
      score,
      items: state.lines.length,
      attempted: recorded,
      mistakes: state.mistakes,
    });
    const n = (value: number) =>
      language === 'en' ? String(value) : value.toLocaleString('fa-IR');
    await this.reply(
      chatId,
      language === 'en'
        ? `Practice finished. Score: ${n(score)} / 100 (${n(recorded)} of ${n(state.lines.length)} sentences recorded).`
        : `تمرین تمام شد. امتیاز: ${n(score)} از ۱۰۰ (${n(recorded)} از ${n(state.lines.length)} جمله ضبط شد).`,
      [
        [
          {
            text: language === 'en' ? 'Scores in the app' : 'امتیازها در اپ',
            url: this.appUrl('/english/practice/scores'),
          },
        ],
      ],
    );
  }

  private async callback(query: NonNullable<TelegramUpdate['callback_query']>) {
    const answer = (text: string, alert = false) =>
      this.api
        .call('answerCallbackQuery', {
          callback_query_id: query.id,
          text,
          show_alert: alert,
        })
        .catch(() => undefined);
    const chat = query.message?.chat.id;
    if (chat === undefined) return void (await answer(''));
    const chatId = BigInt(chat);
    const from = BigInt(query.from?.id ?? chat);
    const link = await this.db.telegramLink.findUnique({ where: { chatId } });
    const english = link?.language === 'en';

    // «I joined»: check again, then finish the link the user started (if any).
    const joined = /^j(?::([A-Za-z0-9_-]{16,60}))?$/.exec(query.data ?? '');
    if (joined) {
      if (!(await this.member(from)))
        return void (await answer(
          english
            ? 'You have not joined the channel yet.'
            : 'هنوز در کانال عضو نشده‌ای.',
          true,
        ));
      await answer('');
      if (joined[1]) return this.link(chatId, joined[1]);
      return this.reply(
        chatId,
        english
          ? 'Thanks. Now write anything you need to do.'
          : 'ممنون. حالا هر کاری داری بنویس.',
      );
    }

    const shadow = /^s:([rnx])$/.exec(query.data ?? '')?.[1];
    if (shadow && link) {
      await answer('');
      if (!(await this.member(from)))
        return this.joinPrompt(chatId, english ? 'en' : 'fa');
      const state = link.shadow as ShadowState | null;
      const language: Lang = english ? 'en' : 'fa';
      if (!state)
        return this.reply(
          chatId,
          english
            ? 'No practice is running. Send /shadow to start one.'
            : 'تمرینی در جریان نیست. برای شروع /shadow را بفرست.',
        );
      if (shadow === 'r')
        return this.sendSentence(link.userId, chatId, language, state);
      if (shadow === 'n')
        return this.advance(link.userId, chatId, language, state);
      return this.finishShadow(link.userId, chatId, language, state);
    }

    const data = query.data ?? '';
    if (link && (data === 'x' || data === 'E:s' || callbackSection(data))) {
      const language: Lang = english ? 'en' : 'fa';
      if (!(await this.member(from))) {
        await answer('');
        return this.joinPrompt(chatId, language);
      }
      await this.refreshMenu(link, chatId, language);
      const ctx: SectionContext = {
        userId: link.userId,
        chatId,
        language,
        pending: activePending(link.pending),
      };
      if (data === 'x') {
        await this.sections.savePending(chatId, null);
        return void (await answer(english ? 'Cancelled' : 'لغو شد'));
      }
      if (data === 'E:s') {
        await answer('');
        return this.startShadow(link.userId, chatId, language);
      }
      if (data === 'p:t') {
        await answer('');
        return this.today(link.userId, chatId, language);
      }
      let toast = '';
      await this.run(ctx, async () => {
        const result = await this.sections.callback(data, ctx);
        toast = result?.toast ?? '';
        return result?.outs ?? [];
      });
      return void (await answer(toast));
    }

    const taskId = /^d:(.{1,60})$/.exec(data)?.[1];
    if (!taskId || !link) return void (await answer(''));
    if (!(await this.member(from))) {
      await answer('');
      return this.joinPrompt(chatId, english ? 'en' : 'fa');
    }
    try {
      await this.tasks.update(link.userId, taskId, { done: true });
      await answer(english ? 'Done' : 'انجام شد');
    } catch {
      await answer(english ? 'Not saved' : 'ثبت نشد');
    }
  }

  private async reply(
    chatId: bigint,
    text: string,
    markup?: TelegramMarkup,
    entities?: TelegramCodeEntity[],
  ) {
    try {
      await this.api.sendMessage(chatId, text, markup, entities);
    } catch (error) {
      if (error instanceof TelegramError && error.gone)
        await this.db.telegramLink.deleteMany({ where: { chatId } });
      else this.logger.warn('Telegram send failed');
    }
  }

  /** Scheduled sweeps: morning summary (10:00 default) and evening card-review reminder (20:00 default, PG-012). */
  async tick(now = new Date()): Promise<void> {
    if (this.running || !this.enabled) return;
    this.running = true;
    try {
      const today = isoDateIn(now, 'Asia/Tehran');
      try {
        await this.sweepSummaries(today, now);
      } catch {
        this.logger.error('Telegram summary sweep failed');
      }
      try {
        await this.sweepReviewReminders(today, now);
      } catch {
        this.logger.error('Telegram review reminder sweep failed');
      }
    } finally {
      this.running = false;
    }
  }

  private async sweepSummaries(today: string, now: Date): Promise<void> {
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
        await this.summary(link.userId, link.chatId, link.language, today, now);
      } catch {
        this.logger.warn('Telegram summary failed');
      }
    }
  }

  /**
   * Daily card-review reminder in Telegram (PG-012): for each linked chat that is a channel member (170),
   * has review reminders on (`review_reminder_settings`; absent row = on at 20:00, matching `reviewSettings()`),
   * and has non-suspended cards due, sends at most one reminder per Tehran day with a button that starts review.
   * Restart-resilient like `PushService` (directive 72): eligible from the chosen time through the end of the
   * Tehran day (with a 5-minute midnight grace for yesterday), and rolls back the day claim on transient send errors.
   */
  private async sweepReviewReminders(today: string, now: Date): Promise<void> {
    const previousDay = addDays(today, -1);
    const links = await this.db.telegramLink.findMany({
      where: {
        OR: [
          { lastReviewReminderDay: null },
          { lastReviewReminderDay: { not: today } },
        ],
      },
      include: {
        user: {
          select: {
            role: true,
            email: true,
            signupSource: true,
            reviewReminder: { select: { enabled: true, time: true } },
          },
        },
      },
    });
    for (const link of links) {
      const enabled = link.user?.reviewReminder?.enabled ?? true;
      if (!enabled) continue;
      const time =
        link.user?.reviewReminder?.time ?? REVIEW_REMINDER_DEFAULT_TIME;
      for (const date of [previousDay, today]) {
        if (
          link.lastReviewReminderDay != null &&
          link.lastReviewReminderDay >= date
        )
          continue;
        const due = zonedInstant(date, time, 'Asia/Tehran')?.getTime();
        if (
          due === undefined ||
          due > now.getTime() ||
          (date !== today && due < now.getTime() - REVIEW_MIDNIGHT_GRACE_MS)
        )
          continue;
        const cards = await this.db.englishCard.count({
          where: {
            userId: link.userId,
            suspended: false,
            dueAt: { lte: now },
            deck: { userId: link.userId },
          },
        });
        if (!cards) break;
        if (!(await this.member(link.chatId))) break;
        const previousClaim = link.lastReviewReminderDay ?? null;
        const claimed = await this.db.telegramLink.updateMany({
          where: {
            userId: link.userId,
            OR: [
              { lastReviewReminderDay: null },
              { lastReviewReminderDay: { lt: date } },
            ],
          },
          data: { lastReviewReminderDay: date },
        });
        if (!claimed.count) continue;
        const language: Lang = link.language === 'en' ? 'en' : 'fa';
        const text = reviewReminderText(language, cards);
        if (!text) break;
        const buttons: TelegramButton[][] = [
          [
            {
              text: language === 'en' ? 'Start review' : 'شروع مرور',
              callback_data: 'E:cd:all',
            },
          ],
        ];
        try {
          await this.api.sendMessage(link.chatId, text, buttons);
        } catch (error) {
          if (error instanceof TelegramError && error.gone) {
            await this.db.telegramLink.deleteMany({
              where: { chatId: link.chatId },
            });
          } else {
            this.logger.warn('Telegram review reminder send failed');
            await this.db.telegramLink
              .updateMany({
                where: {
                  userId: link.userId,
                  lastReviewReminderDay: date,
                },
                data: { lastReviewReminderDay: previousClaim },
              })
              .catch(() => undefined);
          }
          break;
        }
        if (this.isCountableUser(link.user)) {
          await this.incrementDailyCount(today, 'reminder_sent', '').catch(() =>
            this.logger.warn('Telegram review reminder count failed'),
          );
        }
        break;
      }
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
    // The private chat id is the Telegram user id.
    if (!(await this.member(chatId))) return false;
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
    if (!text) return false;
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
    return true;
  }

  /** «Today's tasks» on demand: the same summary, or a short note when the day is empty. */
  private async today(userId: string, chatId: bigint, language: Lang) {
    const now = new Date();
    const sent = await this.summary(
      userId,
      chatId,
      language,
      isoDateIn(now, 'Asia/Tehran'),
      now,
    );
    if (!sent)
      await this.reply(
        chatId,
        language === 'en'
          ? 'Nothing open for today and no cards to review.'
          : 'امروز کار باز یا کارت آمادهٔ مرور نداری.',
      );
  }
}
