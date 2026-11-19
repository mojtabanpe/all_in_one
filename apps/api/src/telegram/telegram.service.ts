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
import { Prisma, PrismaService } from '@all-in-one/api/db';
import { TasksService } from '@all-in-one/applets/planner/api';
import { isoDateIn, zonedInstant } from '@all-in-one/applets/planner/contracts';
import {
  DAILY_TASKS_DEFAULT_TIME,
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
  type TelegramMarkup,
} from './telegram-api';

const CODE_TTL_MS = 10 * 60_000;
/** The morning summary is due from the chosen time for three hours, like the push digest (154). */
const SUMMARY_WINDOW_MS = 3 * 3_600_000;
const SUMMARY_TASKS = 5;
type Lang = 'fa' | 'en';

/** Labels of the reply keyboard (directive 172); a tap sends the label as a message. */
export const MENU_LABELS = {
  today: { fa: 'کارهای امروز', en: "Today's tasks" },
  shadow: { fa: 'شادوینگ', en: 'Shadowing' },
  help: { fa: 'راهنما', en: 'Help' },
} as const;
const isMenu = (text: string, key: keyof typeof MENU_LABELS) =>
  text === MENU_LABELS[key].fa || text === MENU_LABELS[key].en;

/** The persistent buttons above the keyboard once the account is linked. */
export function menuKeyboard(language: Lang) {
  return {
    keyboard: [
      [
        { text: MENU_LABELS.today[language] },
        { text: MENU_LABELS.shadow[language] },
      ],
      [{ text: MENU_LABELS.help[language] }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export const HELP_TEXT = {
  fa: [
    'با این ربات:',
    '• هر کاری داری بنویس تا ثبت شود، مثلاً «فردا ساعت ۵ دندانپزشکی» یا «ناهار قرمه‌سبزی خوردم».',
    '• «کارهای امروز» کارهای باز امروز و کارت‌های آمادهٔ مرور را نشان می‌دهد.',
    '• «شادوینگ» تمرین تلفظ است: جمله را بشنو و با پیام صوتی تکرار کن.',
    '• هر صبح در ساعت خلاصهٔ حسابت، کارهای امروز را می‌فرستم.',
    '/stop اتصال را قطع می‌کند.',
  ].join('\n'),
  en: [
    'With this bot:',
    '• Write anything you need to do and it is logged, for example «dentist tomorrow at 5» or «had pasta for lunch».',
    "• «Today's tasks» shows today's open tasks and the cards ready to review.",
    '• «Shadowing» is pronunciation practice: listen to a sentence and repeat it in a voice message.',
    "• Each morning, at your account's summary time, I send your tasks for the day.",
    '/stop unlinks.',
  ].join('\n'),
};

/** Telegram's Menu button: commands per language, and the bot's description before «Start». */
const COMMANDS = {
  fa: [
    { command: 'today', description: 'کارهای امروز' },
    { command: 'shadow', description: 'تمرین شادوینگ' },
    { command: 'help', description: 'راهنما' },
    { command: 'stop', description: 'قطع اتصال' },
  ],
  en: [
    { command: 'today', description: "Today's tasks" },
    { command: 'shadow', description: 'Shadowing practice' },
    { command: 'help', description: 'Help' },
    { command: 'stop', description: 'Unlink' },
  ],
};
const DESCRIPTION = {
  fa: 'ربات Poshtetgarm: کارهایت را با یک پیام ثبت کن، هر صبح کارهای امروز را بگیر و شادوینگ انگلیسی تمرین کن. اول در اپ «حساب کاربری ← وصل به تلگرام» را بزن.',
  en: 'Poshtetgarm bot: log tasks with one message, get your day each morning and practise English shadowing. First tap «Account → Connect Telegram» in the app.',
};
const SHORT_DESCRIPTION = {
  fa: 'کارها، خلاصهٔ صبح و شادوینگ Poshtetgarm در تلگرام',
  en: 'Poshtetgarm tasks, morning summary and shadowing in Telegram',
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

  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly assistant: AssistantService,
    private readonly tasks: TasksService,
    private readonly gateway: AiGateway,
    private readonly englishAi: EnglishAiService,
    private readonly speech: SpeechService,
    private readonly scores: PracticeScoresService,
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
    if (!this.channel) return true;
    try {
      const result = await this.api.call<{
        status: string;
        is_member?: boolean;
      }>('getChatMember', {
        chat_id: this.channel,
        user_id: Number(telegramUserId),
      });
      return (
        ['creator', 'administrator', 'member'].includes(result.status) ||
        (result.status === 'restricted' && result.is_member === true)
      );
    } catch (error) {
      this.logger.warn(
        `Channel membership check unavailable (${error instanceof TelegramError ? error.code : 'network'}); allowing`,
      );
      return true;
    }
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
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
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
        ? say(HELP_TEXT.fa, HELP_TEXT.en, menuKeyboard(language))
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
    if (text === '/help' || isMenu(text, 'help'))
      return say(HELP_TEXT.fa, HELP_TEXT.en, menuKeyboard(language));
    if (text === '/today' || isMenu(text, 'today'))
      return this.today(link.userId, chatId, language);
    if (text === '/shadow' || /^(شادوینگ|shadowing|shadow)$/i.test(text))
      return this.startShadow(link.userId, chatId, language);
    const voice = message.voice ?? message.audio;
    if (voice) {
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
    const language: Lang = row.language === 'en' ? 'en' : 'fa';
    return this.reply(
      chatId,
      `${language === 'en' ? 'Linked.' : 'وصل شد.'}\n\n${HELP_TEXT[language]}`,
      menuKeyboard(language),
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

    const taskId = /^d:(.{1,60})$/.exec(query.data ?? '')?.[1];
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

  private async reply(chatId: bigint, text: string, markup?: TelegramMarkup) {
    try {
      await this.api.sendMessage(chatId, text, markup);
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
