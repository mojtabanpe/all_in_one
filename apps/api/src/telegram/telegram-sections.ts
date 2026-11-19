import { HttpException, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@all-in-one/api/db';
import { AiGateway } from '@all-in-one/api/ai';
import { loadMessages, translateMessage } from '@all-in-one/localization';
import {
  resolveEnabledApplets,
  type AppApplet,
} from '@all-in-one/shared/schemas';
import { HabitsService, TasksService } from '@all-in-one/applets/planner/api';
import {
  addDays,
  createTaskSchema,
  habitDueOn,
  isoDateIn,
} from '@all-in-one/applets/planner/contracts';
import {
  BodyService,
  HealthService,
  TrainingService,
} from '@all-in-one/applets/health/api';
import {
  fastHoursElapsed,
  logWeightSchema,
  MEAL_TYPES,
  MEAL_TYPE_LABELS,
  startFastSchema,
  weightGoalSchema,
  type MealType,
  type WeightProgress,
} from '@all-in-one/applets/health/contracts';
import {
  CardsService,
  DecksService,
  EnglishAiService,
  PracticeScoresService,
  SpeechService,
  TextsService,
} from '@all-in-one/applets/english-learning/api';
import {
  CONVERSATION_SITUATIONS,
  listeningScore,
  RATINGS,
  READING_TOPICS,
  writingScore,
  type ConversationSituation,
  type ReadingTopic,
} from '@all-in-one/applets/english-learning/contracts';
import { ExpensesService } from '@all-in-one/applets/expenses/api';
import {
  createExpenseSchema,
  updateExpenseCategorySchema,
  type ExpenseReport,
} from '@all-in-one/applets/expenses/contracts';
import { AssistantService } from '../assistant/assistant.service';
import type { TelegramButton, TelegramMarkup } from './telegram-api';
import {
  chunks,
  formatDay,
  formatHours,
  formatTime,
  num,
  numbersIn,
  parseExpenseLines,
  plainReply,
  type Lang,
} from './telegram-format';

/** What a section sends: a text message, or a voice message with a caption. */
export type Out =
  | { text: string; markup?: TelegramMarkup }
  | {
      voice: { data: Uint8Array; contentType: string };
      caption: string;
      buttons?: TelegramButton[][];
    };

/** What the bot waits for in the next message (`telegram_links.pending`). */
export type Pending =
  | { kind: 'task' }
  | { kind: 'meal'; mealType: MealType }
  | { kind: 'weight' }
  | { kind: 'goal' }
  | { kind: 'expense' }
  | { kind: 'budget'; categoryId: string; name: string }
  | {
      kind: 'writing' | 'speaking';
      situation: ConversationSituation;
      scenario: string;
      message: string;
    }
  | {
      kind: 'listening';
      title: string;
      lines: string[];
      questions: { question: string; options: string[]; answer: number }[];
      index: number;
      correct: number;
    };

export interface SectionContext {
  userId: string;
  chatId: bigint;
  language: Lang;
  pending: Pending | null;
}

/** A question the bot asked expires after an hour; a later message is handled as usual. */
const PENDING_TTL_MS = 60 * 60_000;
const OVERDUE_DAYS = 60;
const LIST_LIMIT = 10;
const FAST_PRESETS = [12, 14, 16, 18];
const RATING_LABELS = {
  fa: ['دوباره', 'سخت', 'خوب', 'آسان'],
  en: ['Again', 'Hard', 'Good', 'Easy'],
};
/** Characters of a listening dialogue read aloud (the speech limit is per day). */
const LISTEN_CHARS = 1500;

/** The pending question, or null when there is none or it has expired. */
export function activePending(raw: unknown, now = Date.now()): Pending | null {
  if (!raw || typeof raw !== 'object' || !('kind' in raw)) return null;
  const at = (raw as { at?: number }).at ?? 0;
  return now - at < PENDING_TTL_MS ? (raw as Pending) : null;
}

/** The section each callback prefix belongs to; its use needs that applet on. */
export function callbackSection(data: string): AppApplet | null {
  if (/^(p|hb|hm):/.test(data)) return 'planner';
  if (/^H:/.test(data)) return 'health';
  if (/^(E|c):/.test(data)) return 'english';
  if (/^X:/.test(data)) return 'expenses';
  return null;
}

const SECTION_NAMES: Record<AppApplet, { fa: string; en: string }> = {
  planner: { fa: 'برنامه‌ریز', en: 'Planner' },
  english: { fa: 'زبان', en: 'English' },
  health: { fa: 'سلامت', en: 'Health' },
  expenses: { fa: 'مخارج', en: 'Expenses' },
};

const toman = (language: Lang, amount: number) =>
  language === 'en'
    ? `${num('en', amount)} toman`
    : `${num('fa', amount)} تومان`;

/**
 * The app's sections in the Telegram bot (directive 174): planner, health, English and expenses menus, each built on
 * the applet services the app and the assistant use. Buttons that need no AI work for every linked account; free
 * text (a meal, an unclear expense) goes through the assistant, and practice generation through the English AI,
 * both of which check AI access, scope and daily limits themselves.
 */
@Injectable()
export class TelegramSectionsService {
  constructor(
    private readonly db: PrismaService,
    private readonly assistant: AssistantService,
    private readonly gateway: AiGateway,
    private readonly tasks: TasksService,
    private readonly habits: HabitsService,
    private readonly health: HealthService,
    private readonly body: BodyService,
    private readonly training: TrainingService,
    private readonly decks: DecksService,
    private readonly cards: CardsService,
    private readonly texts: TextsService,
    private readonly englishAi: EnglishAiService,
    private readonly speech: SpeechService,
    private readonly scores: PracticeScoresService,
    private readonly expenses: ExpensesService,
  ) {}

  /** The applets the account has on (expenses only after the user turns it on, directive 160). */
  async applets(userId: string): Promise<AppApplet[]> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { enabledApplets: true, role: true },
    });
    if (!user) return [];
    // Admins always reach expenses, like `ExpensesEnabledGuard`.
    const on = resolveEnabledApplets(user.enabledApplets, user.role);
    return user.role === 'ADMIN' && !on.includes('expenses')
      ? [...on, 'expenses']
      : on;
  }

  async savePending(chatId: bigint, pending: Pending | null) {
    await this.db.telegramLink.updateMany({
      where: { chatId },
      data: {
        pending:
          pending === null
            ? Prisma.DbNull
            : ({ ...pending, at: Date.now() } as object),
      },
    });
  }

  private off(language: Lang, section: AppApplet): Out {
    const name = SECTION_NAMES[section][language];
    return {
      text:
        language === 'en'
          ? `${name} is off in your account. Turn it on in «Account» in the app.`
          : `بخش ${name} در حسابت خاموش است. از «حساب کاربری» در اپ روشنش کن.`,
    };
  }

  private cancelRow(language: Lang): TelegramButton[] {
    return [
      { text: language === 'en' ? 'Cancel' : 'انصراف', callback_data: 'x' },
    ];
  }

  private async ask(
    ctx: SectionContext,
    pending: Pending,
    text: string,
  ): Promise<Out[]> {
    await this.savePending(ctx.chatId, pending);
    return [{ text, markup: [this.cancelRow(ctx.language)] }];
  }

  /** A section's main message with its buttons. */
  async menu(section: AppApplet, ctx: SectionContext): Promise<Out[]> {
    if (!(await this.applets(ctx.userId)).includes(section))
      return [this.off(ctx.language, section)];
    switch (section) {
      case 'planner':
        return this.plannerMenu(ctx);
      case 'health':
        return this.healthMenu(ctx);
      case 'english':
        return this.englishMenu(ctx);
      case 'expenses':
        return this.expensesMenu(ctx);
    }
  }

  /**
   * A button of a section (null: not one of these). `toast` is the short note shown on the button itself.
   * Errors from AI work (no access, daily limit) are thrown for the caller's usual replies.
   */
  async callback(
    data: string,
    ctx: SectionContext,
  ): Promise<{ outs: Out[]; toast?: string } | null> {
    const section = callbackSection(data);
    if (!section) return null;
    if (!(await this.applets(ctx.userId)).includes(section))
      return { outs: [this.off(ctx.language, section)] };
    const L = ctx.language;
    const en = L === 'en';
    let m: RegExpExecArray | null;

    // ---------------------------------------------------------------- planner
    if (data === 'p:o') return { outs: await this.overdue(ctx) };
    if (data === 'p:a')
      return {
        outs: await this.ask(
          ctx,
          { kind: 'task' },
          en
            ? 'Write the task; it is added for today.'
            : 'کار را بنویس؛ برای امروز اضافه می‌شود.',
        ),
      };
    if (data === 'p:h') return { outs: await this.habitList(ctx) };
    if ((m = /^hb:(.{1,60})$/.exec(data))) return this.toggleHabit(ctx, m[1]);
    if ((m = /^hm:(.{1,60})$/.exec(data)))
      return this.toggleHabit(ctx, m[1], -1);

    // ---------------------------------------------------------------- health
    if (data === 'H:d') return { outs: await this.healthMenu(ctx) };
    if (data === 'H:m')
      return {
        outs: [
          {
            text: en ? 'Which meal?' : 'کدام وعده؟',
            markup: [
              MEAL_TYPES.slice(0, 2).map((type) => this.mealButton(L, type)),
              MEAL_TYPES.slice(2).map((type) => this.mealButton(L, type)),
            ],
          },
        ],
      };
    if ((m = /^H:m:([A-Z]+)$/.exec(data))) {
      const type = m[1] as MealType;
      if (!MEAL_TYPES.includes(type)) return { outs: [] };
      return {
        outs: await this.ask(
          ctx,
          { kind: 'meal', mealType: type },
          en
            ? `What did you have for ${this.mealName(L, type).toLowerCase()}? For example «two eggs and bread». I estimate the calories.`
            : `برای ${this.mealName(L, type)} چه خوردی؟ مثلاً «دو تخم‌مرغ و نان». کالری را خودم حساب می‌کنم.`,
        ),
      };
    }
    if (data === 'H:f') return { outs: [await this.fastingOut(L, ctx.userId)] };
    if ((m = /^H:fs:(\d{1,2})$/.exec(data))) {
      await this.body.startFast(
        ctx.userId,
        startFastSchema.parse({ targetHours: Number(m[1]) }),
      );
      return {
        outs: [await this.fastingOut(L, ctx.userId)],
        toast: en ? 'Fast started' : 'روزه شروع شد',
      };
    }
    if (data === 'H:fe') {
      const state = await this.body.fasting(ctx.userId);
      if (!state.active)
        return { outs: [await this.fastingOut(L, ctx.userId)] };
      const ended = await this.body.endFast(ctx.userId, {});
      const last = ended.recent[0];
      const hours = last ? fastHoursElapsed(last, new Date()) : 0;
      return {
        outs: [
          {
            text: en
              ? `Fast finished: ${formatHours(L, hours)}.`
              : `روزه تمام شد: ${formatHours(L, hours)}.`,
          },
        ],
      };
    }
    if (data === 'H:w') return { outs: [await this.weightOut(L, ctx.userId)] };
    if (data === 'H:wl')
      return {
        outs: await this.ask(
          ctx,
          { kind: 'weight' },
          en
            ? "Send today's weight in kilograms, for example «82.5»."
            : 'وزن امروز را به کیلوگرم بفرست، مثلاً «۸۲٫۵».',
        ),
      };
    if (data === 'H:wg')
      return {
        outs: await this.ask(
          ctx,
          { kind: 'goal' },
          en
            ? 'Send the target weight and the number of weeks, for example «78 12».'
            : 'وزن هدف و تعداد هفته‌ها را بفرست، مثلاً «۷۸ ۱۲».',
        ),
      };
    if (data === 'H:t') return { outs: await this.trainingOut(ctx) };
    if ((m = /^H:r:([0-9a-f-]{36})(?::(\d))?$/.exec(data)))
      return {
        outs: await this.trainingOut(
          ctx,
          m[1],
          m[2] === undefined ? undefined : Number(m[2]),
        ),
      };

    // ---------------------------------------------------------------- english
    if (data === 'E:c') return { outs: await this.englishMenu(ctx) };
    if ((m = /^E:cd:([0-9a-f-]{36}|all)$/.exec(data)))
      return {
        outs: await this.nextCard(ctx, m[1] === 'all' ? null : m[1]),
      };
    if ((m = /^c:a:([0-9a-f-]{36}):([ad])$/.exec(data)))
      return { outs: await this.cardAnswer(ctx, m[1], m[2] as 'a' | 'd') };
    if ((m = /^c:g:([0-9a-f-]{36}):([0-3]):([ad])$/.exec(data))) {
      const card = await this.cards.review(
        ctx.userId,
        m[1],
        RATINGS[Number(m[2])],
      );
      return {
        outs: await this.nextCard(ctx, m[3] === 'd' ? card.deckId : null),
        toast: RATING_LABELS[L][Number(m[2])],
      };
    }
    if (data === 'E:w' || data === 'E:k')
      return { outs: await this.practiceTask(ctx, data === 'E:w') };
    if (data === 'E:l') return { outs: await this.listening(ctx) };
    if ((m = /^E:lq:(\d{1,2}):(\d)$/.exec(data)))
      return { outs: await this.listeningAnswer(ctx, +m[1], +m[2]) };
    if (data === 'E:r') return { outs: await this.readings(ctx) };
    if ((m = /^E:rt:([0-9a-f-]{36})$/.exec(data))) {
      const text = await this.texts.get(ctx.userId, m[1]);
      return { outs: this.readingOuts(text.title, text.body) };
    }
    if (data === 'E:rn')
      return {
        outs: [
          {
            text: en ? 'Pick a topic:' : 'موضوع را انتخاب کن:',
            markup: this.rows(
              READING_TOPICS.map((topic) => ({
                text: en ? topic.label : topic.fa,
                callback_data: `E:rn:${topic.id}`,
              })),
            ),
          },
        ],
      };
    if ((m = /^E:rn:([a-z-]{1,30})$/.exec(data))) {
      const topic = READING_TOPICS.find((t) => t.id === m?.[1]);
      if (!topic) return { outs: [] };
      const generated = await this.englishAi.readingText(
        ctx.userId,
        topic.id as ReadingTopic,
      );
      const saved = await this.texts.create(ctx.userId, {
        title: generated.title.slice(0, 200),
        body: generated.body,
        ai: true,
      });
      return { outs: this.readingOuts(saved.title, saved.body) };
    }

    // ---------------------------------------------------------------- expenses
    if (data === 'X:a')
      return {
        outs: await this.ask(
          ctx,
          { kind: 'expense' },
          en
            ? 'Send each expense on its own line: a title and the amount in toman, for example:\nbread 50000\ntaxi 80k'
            : 'هر هزینه در یک خط: عنوان و مبلغ به تومان، مثلاً:\nنان ۵۰٬۰۰۰\nتاکسی ۸۰ هزار',
        ),
      };
    if (data === 'X:r') return { outs: [await this.reportOut(L, ctx.userId)] };
    if (data === 'X:b') return { outs: [await this.budgetsOut(L, ctx.userId)] };
    if ((m = /^X:bs:([0-9a-f-]{36})$/.exec(data))) {
      const category = (await this.expenses.listCategories(ctx.userId)).find(
        (c) => c.id === m?.[1],
      );
      if (!category) return { outs: [] };
      return {
        outs: await this.ask(
          ctx,
          { kind: 'budget', categoryId: category.id, name: category.name },
          en
            ? `Monthly budget for «${category.name}» in toman (0 removes it):`
            : `بودجهٔ ماهانهٔ «${category.name}» به تومان (۰ یعنی بدون بودجه):`,
        ),
      };
    }
    return null;
  }

  /** The answer to a question the bot asked (null: nothing pending for text). */
  async text(text: string, ctx: SectionContext): Promise<Out[] | null> {
    const pending = ctx.pending;
    if (!pending || pending.kind === 'listening') return null;
    const L = ctx.language;
    const en = L === 'en';
    if (pending.kind === 'speaking')
      return [
        {
          text: en
            ? 'Answer this one in a voice message.'
            : 'این تمرین را با پیام صوتی جواب بده.',
          markup: [this.cancelRow(L)],
        },
      ];
    await this.savePending(ctx.chatId, null);
    const today = isoDateIn(new Date());
    switch (pending.kind) {
      case 'task': {
        const task = await this.tasks.create(
          ctx.userId,
          createTaskSchema.parse({ title: text.slice(0, 200), date: today }),
        );
        return [
          {
            text: en
              ? `Added for today: ${task.title}`
              : `برای امروز اضافه شد: ${task.title}`,
            markup: this.taskButtons([task]),
          },
        ];
      }
      case 'meal': {
        const name = this.mealName(L, pending.mealType);
        return [
          await this.viaAssistant(
            ctx,
            en
              ? `Log this as today's ${name.toLowerCase()}: ${text}`
              : `این را ${name} امروز ثبت کن: ${text}`,
          ),
        ];
      }
      case 'weight': {
        const value = numbersIn(text)[0];
        const parsed = logWeightSchema.safeParse({
          date: today,
          weightKg: value,
        });
        if (!parsed.success)
          return this.ask(
            ctx,
            pending,
            en
              ? 'Send a weight between 30 and 300 kg, for example «82.5».'
              : 'وزنی بین ۳۰ تا ۳۰۰ کیلو بفرست، مثلاً «۸۲٫۵».',
          );
        await this.body.logWeight(ctx.userId, parsed.data);
        return [await this.weightOut(L, ctx.userId)];
      }
      case 'goal': {
        const [kg, weeks] = numbersIn(text);
        const parsed = weightGoalSchema.safeParse({
          targetWeightKg: kg,
          targetDate:
            weeks && weeks >= 1 && weeks <= 104
              ? addDays(today, Math.round(weeks) * 7)
              : undefined,
        });
        if (!parsed.success)
          return this.ask(
            ctx,
            pending,
            en
              ? 'Send the target weight and weeks (1 to 104), for example «78 12».'
              : 'وزن هدف و تعداد هفته‌ها (۱ تا ۱۰۴) را بفرست، مثلاً «۷۸ ۱۲».',
          );
        try {
          await this.body.setGoal(ctx.userId, parsed.data);
        } catch (error) {
          if (!(error instanceof HttpException) || error.getStatus() !== 400)
            throw error;
          return [
            {
              text: en
                ? 'The goal was not saved. Log your current weight first; the date must be 1 week to 2 years away.'
                : `هدف ثبت نشد: ${error.message}`,
            },
          ];
        }
        return [await this.weightOut(L, ctx.userId)];
      }
      case 'expense':
        return this.addExpenses(ctx, text);
      case 'budget': {
        const zero = /^\s*[0۰٠]\s*$/.test(text);
        const amount = zero
          ? null
          : parseExpenseLines(`x ${text}`)?.[0]?.amount;
        if (amount === undefined)
          return this.ask(
            ctx,
            pending,
            en
              ? 'Send an amount in toman, for example «3000000» or «3 million».'
              : 'مبلغ را به تومان بفرست، مثلاً «۳٬۰۰۰٬۰۰۰» یا «۳ میلیون».',
          );
        await this.expenses.updateCategory(
          ctx.userId,
          pending.categoryId,
          updateExpenseCategorySchema.parse({ monthlyBudget: amount }),
        );
        return [await this.budgetsOut(L, ctx.userId)];
      }
      case 'writing':
        return this.practiceFeedback(ctx, pending, text, 'WRITING');
    }
  }

  /** A voice message while a speaking task waits for one (null: none waits). */
  async voice(audio: Buffer, ctx: SectionContext): Promise<Out[] | null> {
    const pending = ctx.pending;
    if (pending?.kind !== 'speaking') return null;
    const heard = (
      await this.gateway.transcribe(ctx.userId, audio, 'audio/ogg')
    ).trim();
    if (!heard)
      return [
        {
          text:
            ctx.language === 'en'
              ? 'I could not hear any words. Record again, a little closer to the microphone.'
              : 'کلمه‌ای نشنیدم. دوباره ضبط کن، کمی نزدیک‌تر به میکروفون.',
        },
      ];
    await this.savePending(ctx.chatId, null);
    const outs = await this.practiceFeedback(ctx, pending, heard, 'SPEAKING');
    return [
      {
        text: (ctx.language === 'en' ? 'I heard: ' : 'شنیدم: ') + `«${heard}»`,
      },
      ...outs,
    ];
  }

  // ======================================================================= planner

  private taskButtons(tasks: { id: string; title: string }[]) {
    return tasks
      .filter((task) => `d:${task.id}`.length <= 64)
      .slice(0, LIST_LIMIT)
      .map((task) => [
        { text: `✓ ${task.title}`.slice(0, 60), callback_data: `d:${task.id}` },
      ]);
  }

  private async overdueTasks(userId: string) {
    const today = isoDateIn(new Date());
    return this.tasks.filter(userId, {
      status: 'open',
      kind: 'TASK',
      from: addDays(today, -OVERDUE_DAYS),
      to: addDays(today, -1),
    });
  }

  private async plannerMenu(ctx: SectionContext): Promise<Out[]> {
    const L = ctx.language;
    const en = L === 'en';
    const today = isoDateIn(new Date());
    const [open, overdue, habits] = await Promise.all([
      this.tasks.filter(ctx.userId, {
        from: today,
        to: today,
        status: 'open',
        kind: 'TASK',
      }),
      this.overdueTasks(ctx.userId),
      this.habits.all(ctx.userId, { from: today, to: today }),
    ]);
    const due = habits.filter((h) => habitDueOn(h, today));
    const done = due.filter((h) =>
      h.checkins.some((c) => c.date === today && c.value >= h.goal),
    );
    const text = en
      ? [
          `Planner: ${formatDay(L, today)}`,
          `${num(L, open.length)} open today, ${num(L, overdue.length)} overdue`,
          due.length
            ? `Habits: ${num(L, done.length)} of ${num(L, due.length)} done`
            : '',
        ]
      : [
          `برنامه‌ریز: ${formatDay(L, today)}`,
          `امروز ${num(L, open.length)} کار باز، ${num(L, overdue.length)} عقب‌افتاده`,
          due.length
            ? `عادت‌ها: ${num(L, done.length)} از ${num(L, due.length)} انجام شد`
            : '',
        ];
    return [
      {
        text: text.filter(Boolean).join('\n'),
        markup: [
          [
            { text: en ? 'Today' : 'امروز', callback_data: 'p:t' },
            { text: en ? 'Overdue' : 'عقب‌افتاده', callback_data: 'p:o' },
          ],
          [
            { text: en ? 'New task' : 'کار جدید', callback_data: 'p:a' },
            { text: en ? 'Habits' : 'عادت‌ها', callback_data: 'p:h' },
          ],
        ],
      },
    ];
  }

  private async overdue(ctx: SectionContext): Promise<Out[]> {
    const en = ctx.language === 'en';
    const tasks = await this.overdueTasks(ctx.userId);
    if (!tasks.length)
      return [{ text: en ? 'No overdue tasks.' : 'کار عقب‌افتاده‌ای نداری.' }];
    const lines = tasks
      .slice(0, LIST_LIMIT)
      .map(
        (task) =>
          `• ${task.title}${task.date ? ` (${formatDay(ctx.language, task.date)})` : ''}`,
      );
    if (tasks.length > LIST_LIMIT)
      lines.push(
        en
          ? `and ${num('en', tasks.length - LIST_LIMIT)} more`
          : `و ${num('fa', tasks.length - LIST_LIMIT)} کار دیگر`,
      );
    return [
      {
        text: `${en ? 'Overdue' : 'عقب‌افتاده'}: ${num(ctx.language, tasks.length)}\n${lines.join('\n')}`,
        markup: this.taskButtons(tasks),
      },
    ];
  }

  private async habitList(ctx: SectionContext): Promise<Out[]> {
    const en = ctx.language === 'en';
    const today = isoDateIn(new Date());
    const habits = (
      await this.habits.all(ctx.userId, { from: today, to: today })
    ).filter((h) => habitDueOn(h, today));
    if (!habits.length)
      return [
        {
          text: en ? 'No habits for today.' : 'امروز عادتی برای ثبت نداری.',
        },
      ];
    return [
      {
        text: en
          ? "Today's habits: tap to check in (one at a time for counted habits); − takes one back."
          : 'عادت‌های امروز: بزن تا ثبت شود (عادت‌های شمارشی یکی‌یکی)؛ «−» یکی کم می‌کند.',
        markup: habits.slice(0, 20).map((h) => {
          const value = h.checkins.find((c) => c.date === today)?.value ?? 0;
          const done = value >= h.goal;
          const n = (x: number) => (en ? String(x) : x.toLocaleString('fa-IR'));
          // Like the app: a counted habit (goal > 1) adds one per tap, with − to take one back.
          const counted = h.goal > 1;
          const row = [
            {
              text: `${done ? '✓' : '○'} ${h.name}${
                counted ? ` ${n(value)}/${n(h.goal)}` : ''
              }`.slice(0, 60),
              callback_data: `hb:${h.id}`,
            },
          ];
          if (counted && value > 0)
            row.push({ text: '−', callback_data: `hm:${h.id}` });
          return row;
        }),
      },
    ];
  }

  /**
   * A tap on a habit, as in the app: a single-check habit toggles done/undone; a counted habit (goal > 1, e.g. four
   * glasses of water) adds one, and `step = -1` (the − button) takes one back.
   */
  private async toggleHabit(ctx: SectionContext, id: string, step: 1 | -1 = 1) {
    const today = isoDateIn(new Date());
    const habit = await this.habits.get(ctx.userId, id);
    const current = habit.checkins.find((c) => c.date === today)?.value ?? 0;
    const value =
      habit.goal > 1
        ? Math.max(0, current + step)
        : current >= habit.goal
          ? 0
          : habit.goal;
    await this.habits.checkin(ctx.userId, id, { date: today, value });
    const en = ctx.language === 'en';
    const n = (x: number) => (en ? String(x) : x.toLocaleString('fa-IR'));
    const toast =
      habit.goal > 1
        ? `${n(value)}/${n(habit.goal)}`
        : value
          ? en
            ? 'Done'
            : 'ثبت شد'
          : en
            ? 'Undone'
            : 'برداشته شد';
    return { outs: await this.habitList(ctx), toast };
  }

  // ======================================================================= health

  private mealName(language: Lang, type: MealType) {
    if (language === 'fa') return MEAL_TYPE_LABELS[type];
    return {
      BREAKFAST: 'Breakfast',
      LUNCH: 'Lunch',
      DINNER: 'Dinner',
      SNACK: 'Snack',
    }[type];
  }

  private mealButton(language: Lang, type: MealType): TelegramButton {
    return {
      text: this.mealName(language, type),
      callback_data: `H:m:${type}`,
    };
  }

  private async healthMenu(ctx: SectionContext): Promise<Out[]> {
    const L = ctx.language;
    const en = L === 'en';
    const today = isoDateIn(new Date());
    const lines: string[] = [];
    try {
      const day = await this.health.nutritionDay(ctx.userId, today);
      lines.push(
        en
          ? `Today: ${num(L, Math.round(day.calories))} of ${num(L, day.calorieTarget)} kcal`
          : `امروز: ${num(L, Math.round(day.calories))} از ${num(L, day.calorieTarget)} کالری`,
        en
          ? `Protein ${num(L, Math.round(day.proteinG))} g, carbs ${num(L, Math.round(day.carbsG))} g, fat ${num(L, Math.round(day.fatG))} g`
          : `پروتئین ${num(L, Math.round(day.proteinG))} گرم، کربوهیدرات ${num(L, Math.round(day.carbsG))} گرم، چربی ${num(L, Math.round(day.fatG))} گرم`,
      );
      for (const meal of day.meals.slice(0, 8))
        lines.push(
          `• ${this.mealName(L, meal.mealType)}: ${meal.description}${
            meal.calories != null
              ? ` (${num(L, Math.round(meal.calories))}${en ? ' kcal' : ''})`
              : ''
          }`,
        );
    } catch (error) {
      if (!(error instanceof HttpException)) throw error;
      lines.push(
        en
          ? 'Complete your health profile in the app to see calories.'
          : 'برای دیدن کالری، پروفایل سلامت را در اپ کامل کن.',
      );
    }
    return [
      {
        text: lines.join('\n'),
        markup: [
          [
            { text: en ? 'Log a meal' : 'ثبت وعده', callback_data: 'H:m' },
            { text: en ? 'Fasting' : 'روزه', callback_data: 'H:f' },
          ],
          [
            { text: en ? 'Weight' : 'وزن', callback_data: 'H:w' },
            { text: en ? 'Workout' : 'تمرین', callback_data: 'H:t' },
          ],
        ],
      },
    ];
  }

  private async fastingOut(L: Lang, userId: string): Promise<Out> {
    const en = L === 'en';
    const state = await this.body.fasting(userId);
    const now = new Date();
    if (state.active) {
      const elapsed = fastHoursElapsed(state.active, now);
      const end = new Date(
        Date.parse(state.active.startedAt) +
          state.active.targetHours * 3_600_000,
      );
      return {
        text: en
          ? `Fasting since ${formatTime(L, state.active.startedAt)}: ${formatHours(L, elapsed)} of ${num(L, state.active.targetHours)} hours. Target end ${formatTime(L, end)}.`
          : `روزه از ساعت ${formatTime(L, state.active.startedAt)}: ${formatHours(L, elapsed)} از ${num(L, state.active.targetHours)} ساعت. پایان هدف ساعت ${formatTime(L, end)}.`,
        markup: [
          [{ text: en ? 'End the fast' : 'پایان روزه', callback_data: 'H:fe' }],
        ],
      };
    }
    const last = state.recent[0];
    return {
      text: [
        en
          ? 'No fast is running. Start one:'
          : 'روزه‌ای در جریان نیست. شروع کن:',
        last
          ? en
            ? `Last fast: ${formatHours(L, fastHoursElapsed(last, now))}.`
            : `روزهٔ قبلی: ${formatHours(L, fastHoursElapsed(last, now))}.`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
      markup: [
        FAST_PRESETS.map((hours) => ({
          text: en
            ? `${hours}:${24 - hours}`
            : `${num('fa', hours)}:${num('fa', 24 - hours)}`,
          callback_data: `H:fs:${hours}`,
        })),
      ],
    };
  }

  private paceText(L: Lang, progress: WeightProgress): string {
    const plan = progress.plan;
    if (!plan) return '';
    const en = L === 'en';
    if (plan.pace === 'done')
      return en ? 'You reached the goal.' : 'به هدف رسیدی.';
    if (plan.pace === 'overdue')
      return en ? 'The goal date has passed.' : 'تاریخ هدف گذشته است.';
    const weekly = num(L, Math.abs(Math.round(plan.weeklyKg * 10) / 10));
    const verb =
      plan.weeklyKg >= 0
        ? en
          ? 'lose'
          : 'کم کردن'
        : en
          ? 'gain'
          : 'اضافه کردن';
    const pace = {
      safe: en ? 'a safe pace' : 'سرعت مناسب',
      fast: en ? 'a fast pace' : 'سرعت زیاد',
      'too-fast': en
        ? 'too fast: pick a later date'
        : 'خیلی سریع است؛ تاریخ دیرتری انتخاب کن',
    }[plan.pace];
    return en
      ? `${weekly} kg to ${verb} a week (${pace}).`
      : `هر هفته ${weekly} کیلو ${verb} (${pace}).`;
  }

  private async weightOut(L: Lang, userId: string): Promise<Out> {
    const en = L === 'en';
    const progress = await this.body.weight(userId);
    const lines = [
      progress.currentKg != null
        ? en
          ? `Current weight: ${num(L, progress.currentKg)} kg`
          : `وزن فعلی: ${num(L, progress.currentKg)} کیلو`
        : en
          ? 'No weigh-in yet.'
          : 'هنوز وزنی ثبت نکرده‌ای.',
    ];
    if (progress.targetKg != null && progress.targetDate)
      lines.push(
        en
          ? `Goal: ${num(L, progress.targetKg)} kg by ${formatDay(L, progress.targetDate)}`
          : `هدف: ${num(L, progress.targetKg)} کیلو تا ${formatDay(L, progress.targetDate)}`,
        this.paceText(L, progress),
      );
    return {
      text: lines.filter(Boolean).join('\n'),
      markup: [
        [
          { text: en ? 'Log weight' : 'ثبت وزن', callback_data: 'H:wl' },
          { text: en ? 'Weight goal' : 'هدف وزن', callback_data: 'H:wg' },
        ],
      ],
    };
  }

  /** This week's training and a routine day: the next one by sessions this week, or the one picked. */
  private async trainingOut(
    ctx: SectionContext,
    routineId?: string,
    dayIndex?: number,
  ): Promise<Out[]> {
    const L = ctx.language;
    const en = L === 'en';
    const today = isoDateIn(new Date());
    const [week, routines] = await Promise.all([
      this.health.week(ctx.userId, today),
      this.training.routines(ctx.userId),
    ]);
    const header = en
      ? `This week: ${num(L, week.sessions)} sessions, ${num(L, week.minutes)} of ${num(L, week.goalMinutes)} minutes`
      : `این هفته: ${num(L, week.sessions)} جلسه، ${num(L, week.minutes)} از ${num(L, week.goalMinutes)} دقیقه`;
    if (!routines.length)
      return [
        {
          text: `${header}\n${en ? 'You have no training routine yet. Make one in the app.' : 'هنوز برنامهٔ تمرینی نداری. در اپ بساز.'}`,
        },
      ];
    const routine = routines.find((r) => r.id === routineId) ?? routines[0];
    const index =
      dayIndex !== undefined && dayIndex < routine.days.length
        ? dayIndex
        : week.sessions % routine.days.length;
    const day = routine.days[index];
    if (en) await loadMessages();
    const names = new Map(
      (await this.training.exercises()).map((e) => [
        e.slug,
        en ? translateMessage(e.name, 'en') : e.name,
      ]),
    );
    const lines = [
      header,
      '',
      `${routine.title}: ${day.title}`,
      ...day.exercises.map((x) => {
        const amount = x.seconds
          ? en
            ? `${x.seconds} s`
            : `${num(L, x.seconds)} ثانیه`
          : num(L, x.reps);
        const load = x.weightKg
          ? en
            ? `, ${x.weightKg} kg`
            : `، ${num(L, x.weightKg)} کیلو`
          : '';
        return `• ${names.get(x.exerciseSlug) ?? x.exerciseSlug}: ${num(L, x.sets)} × ${amount}${load}`;
      }),
    ];
    const markup: TelegramButton[][] = [];
    if (routines.length > 1)
      markup.push(
        ...this.rows(
          routines.slice(0, 6).map((r) => ({
            text: (r.id === routine.id ? '• ' : '') + r.title.slice(0, 40),
            callback_data: `H:r:${r.id}`,
          })),
        ),
      );
    if (routine.days.length > 1)
      markup.push(
        ...this.rows(
          routine.days.map((d, i) => ({
            text: (i === index ? '• ' : '') + d.title.slice(0, 30),
            callback_data: `H:r:${routine.id}:${i}`,
          })),
        ),
      );
    return [{ text: lines.join('\n'), markup }];
  }

  // ======================================================================= english

  private rows(buttons: TelegramButton[], size = 2): TelegramButton[][] {
    const rows: TelegramButton[][] = [];
    for (let i = 0; i < buttons.length; i += size)
      rows.push(buttons.slice(i, i + size));
    return rows;
  }

  private async englishMenu(ctx: SectionContext): Promise<Out[]> {
    const L = ctx.language;
    const en = L === 'en';
    const decks = await this.decks.list(ctx.userId);
    const due = decks.reduce((sum, deck) => sum + deck.due, 0);
    const deckButtons = decks
      .filter((deck) => deck.due > 0)
      .slice(0, 8)
      .map((deck) => ({
        text: `${deck.name.slice(0, 30)} (${num(L, deck.due)})`,
        callback_data: `E:cd:${deck.id}`,
      }));
    return [
      {
        text: due
          ? en
            ? `${num(L, due)} cards ready to review. Pick a deck:`
            : `${num(L, due)} کارت آمادهٔ مرور است. دسته را انتخاب کن:`
          : en
            ? 'No cards to review now.'
            : 'الان کارتی برای مرور نیست.',
        markup: [
          ...(due
            ? [
                [
                  {
                    text: en
                      ? `All decks (${due})`
                      : `همهٔ دسته‌ها (${num(L, due)})`,
                    callback_data: 'E:cd:all',
                  },
                ],
                ...this.rows(deckButtons),
              ]
            : []),
          [
            { text: en ? 'Shadowing' : 'شادوینگ', callback_data: 'E:s' },
            { text: en ? 'Listening' : 'شنیدن', callback_data: 'E:l' },
          ],
          [
            { text: en ? 'Writing' : 'نوشتن', callback_data: 'E:w' },
            { text: en ? 'Speaking' : 'صحبت', callback_data: 'E:k' },
          ],
          [{ text: en ? 'Reading' : 'خواندن', callback_data: 'E:r' }],
        ],
      },
    ];
  }

  /** The next due card (of one deck, or all decks), front only. */
  private async nextCard(
    ctx: SectionContext,
    deckId: string | null,
  ): Promise<Out[]> {
    const en = ctx.language === 'en';
    const where = {
      userId: ctx.userId,
      suspended: false,
      dueAt: { lte: new Date() },
      deck: { userId: ctx.userId },
      ...(deckId ? { deckId } : {}),
    };
    const [card, left] = await Promise.all([
      this.db.englishCard.findFirst({
        where,
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        select: { id: true, front: true, unit: true },
      }),
      this.db.englishCard.count({ where }),
    ]);
    if (!card)
      return [
        {
          text: en
            ? 'Review finished: no more cards due.'
            : 'مرور تمام شد: کارت دیگری برای مرور نمانده.',
        },
      ];
    const mode = deckId ? 'd' : 'a';
    return [
      {
        text: `${card.front}${card.unit ? ` (${card.unit})` : ''}\n\n${en ? `${left} left` : `${num('fa', left)} کارت مانده`}`,
        markup: [
          [
            {
              text: en ? 'Show answer' : 'نمایش پاسخ',
              callback_data: `c:a:${card.id}:${mode}`,
            },
          ],
        ],
      },
    ];
  }

  private async cardAnswer(
    ctx: SectionContext,
    id: string,
    mode: 'a' | 'd',
  ): Promise<Out[]> {
    const card = await this.cards.get(ctx.userId, id);
    const examples = card.examples.trim();
    return [
      {
        text: `${card.front}\n\n${card.back}${examples ? `\n\n${examples}` : ''}`.slice(
          0,
          3900,
        ),
        markup: [
          RATINGS.map((_, i) => ({
            text: RATING_LABELS[ctx.language][i],
            callback_data: `c:g:${card.id}:${i}:${mode}`,
          })),
        ],
      },
    ];
  }

  private situation(): ConversationSituation {
    return CONVERSATION_SITUATIONS[
      Math.floor(Math.random() * CONVERSATION_SITUATIONS.length)
    ].id;
  }

  /** A writing (or speaking) task from the app's generator; the answer comes in the next message. */
  private async practiceTask(
    ctx: SectionContext,
    writing: boolean,
  ): Promise<Out[]> {
    const en = ctx.language === 'en';
    const situation = this.situation();
    const task = await this.englishAi.writingTask(ctx.userId, situation);
    const lines = [
      writing
        ? en
          ? 'Writing practice'
          : 'تمرین نوشتن'
        : en
          ? 'Speaking practice'
          : 'تمرین صحبت',
      task.scenario,
      task.message ? `«${task.message}»` : '',
      writing
        ? en
          ? 'Write your answer in English.'
          : 'جوابت را به انگلیسی بنویس.'
        : en
          ? 'Answer in English in a voice message.'
          : 'جوابت را به انگلیسی با پیام صوتی بفرست.',
    ];
    return this.ask(
      ctx,
      {
        kind: writing ? 'writing' : 'speaking',
        situation,
        scenario: task.scenario.slice(0, 600),
        message: task.message.slice(0, 600),
      },
      lines.filter(Boolean).join('\n\n'),
    );
  }

  /** The app's writing feedback and score (directive 102), saved with the practice scores. */
  private async practiceFeedback(
    ctx: SectionContext,
    task: Extract<Pending, { kind: 'writing' | 'speaking' }>,
    answer: string,
    kind: 'WRITING' | 'SPEAKING',
  ): Promise<Out[]> {
    const L = ctx.language;
    const en = L === 'en';
    const trimmed = answer.trim().slice(0, 3000);
    const feedback = await this.englishAi.writingFeedback(ctx.userId, {
      situation: task.situation,
      scenario: task.scenario,
      message: task.message || undefined,
      answer: trimmed,
    });
    const score = writingScore(trimmed, feedback.mistakes.length);
    const words = Math.max(trimmed.split(/\s+/).filter(Boolean).length, 1);
    await this.scores.save(ctx.userId, {
      kind,
      title: (task.scenario || 'Practice').slice(0, 200),
      score,
      items: words,
      attempted: words,
      mistakes: feedback.mistakes.length,
    });
    const lines = [
      en ? `Score: ${score} / 100` : `امتیاز: ${num('fa', score)} از ۱۰۰`,
      feedback.mistakes.length
        ? [
            en ? 'Mistakes:' : 'اشتباه‌ها:',
            ...feedback.mistakes
              .slice(0, 8)
              .map(
                (x) =>
                  `• ${x.original} → ${x.fix}${x.why ? ` (${x.why})` : ''}`,
              ),
          ].join('\n')
        : en
          ? 'No mistakes.'
          : 'اشتباهی نبود.',
      feedback.corrected && feedback.mistakes.length
        ? `${en ? 'Corrected' : 'درست‌شده'}: ${feedback.corrected}`
        : '',
      feedback.natural
        ? `${en ? 'Natural' : 'طبیعی‌تر'}: ${feedback.natural}`
        : '',
      feedback.comment,
    ];
    return [
      {
        text: lines.filter(Boolean).join('\n\n').slice(0, 3900),
        markup: [
          [
            {
              text: en ? 'Next practice' : 'تمرین بعدی',
              callback_data: kind === 'WRITING' ? 'E:w' : 'E:k',
            },
          ],
        ],
      },
    ];
  }

  /** A dialogue read aloud (text if speech is unavailable), then its comprehension questions one by one. */
  private async listening(ctx: SectionContext): Promise<Out[]> {
    const en = ctx.language === 'en';
    const dialogue = await this.englishAi.dialogue(
      ctx.userId,
      this.situation(),
    );
    const lines = dialogue.lines
      .map((line) => `${line.speaker}: ${line.text.trim()}`)
      .filter((line) => line.length > 3);
    const questions = dialogue.questions
      .filter((q) => q.options.length >= 2 && q.options.length <= 6)
      .slice(0, 5);
    const outs: Out[] = [];
    let spoken = '';
    for (const line of dialogue.lines) {
      if ((spoken + ' ' + line.text).length > LISTEN_CHARS) break;
      spoken = `${spoken} ${line.text.trim()}`.trim();
    }
    const intro = en
      ? `Listening: ${dialogue.title}\nListen, then answer the questions.`
      : `شنیدن: ${dialogue.title}\nگوش کن و بعد به سؤال‌ها جواب بده.`;
    try {
      const audio = await this.speech.speak(ctx.userId, spoken, 'primary');
      outs.push({
        voice: { data: audio.audio, contentType: audio.contentType },
        caption: intro,
      });
    } catch (error) {
      if (!(error instanceof HttpException)) throw error;
      outs.push({
        text: `${intro}\n\n${en ? 'Audio is not available now; read it instead:' : 'صدا الان در دسترس نیست؛ متن را بخوان:'}\n${lines.join('\n')}`.slice(
          0,
          3900,
        ),
      });
    }
    if (!questions.length) return outs;
    const pending: Pending = {
      kind: 'listening',
      title: dialogue.title.slice(0, 200),
      lines: lines.slice(0, 30),
      questions,
      index: 0,
      correct: 0,
    };
    await this.savePending(ctx.chatId, pending);
    outs.push(this.question(ctx.language, pending));
    return outs;
  }

  private question(
    L: Lang,
    state: Extract<Pending, { kind: 'listening' }>,
  ): Out {
    const q = state.questions[state.index];
    return {
      text: `${num(L, state.index + 1)}/${num(L, state.questions.length)}\n${q.question}`,
      markup: q.options.map((option, i) => [
        {
          text: option.slice(0, 60),
          callback_data: `E:lq:${state.index}:${i}`,
        },
      ]),
    };
  }

  /** The first pick counts, like the app; the last answer saves the listening score. */
  private async listeningAnswer(
    ctx: SectionContext,
    index: number,
    option: number,
  ): Promise<Out[]> {
    const en = ctx.language === 'en';
    const state = ctx.pending;
    if (state?.kind !== 'listening' || state.index !== index) return [];
    const q = state.questions[index];
    const right = option === q.answer;
    const next = {
      ...state,
      index: index + 1,
      correct: state.correct + (right ? 1 : 0),
    };
    const verdict: Out = {
      text: right
        ? en
          ? '✓ Correct'
          : '✓ درست'
        : `✗ ${en ? 'Answer' : 'جواب'}: ${q.options[q.answer] ?? ''}`,
    };
    if (next.index < next.questions.length) {
      await this.savePending(ctx.chatId, next);
      return [verdict, this.question(ctx.language, next)];
    }
    await this.savePending(ctx.chatId, null);
    const total = next.questions.length;
    const score = listeningScore(next.correct, total);
    await this.scores.save(ctx.userId, {
      kind: 'LISTENING',
      title: next.title || 'Listening',
      score,
      items: total,
      attempted: total,
      mistakes: total - next.correct,
    });
    return [
      verdict,
      {
        text: `${
          en
            ? `Score: ${score} / 100 (${next.correct} of ${total} right).`
            : `امتیاز: ${num('fa', score)} از ۱۰۰ (${num('fa', next.correct)} از ${num('fa', total)} درست).`
        }\n\n${next.lines.join('\n')}`.slice(0, 3900),
        markup: [
          [
            {
              text: en ? 'Next dialogue' : 'گفت‌وگوی بعدی',
              callback_data: 'E:l',
            },
          ],
        ],
      },
    ];
  }

  private async readings(ctx: SectionContext): Promise<Out[]> {
    const en = ctx.language === 'en';
    const texts = (await this.texts.list(ctx.userId)).slice(0, 6);
    return [
      {
        text: texts.length
          ? en
            ? 'Your reading texts:'
            : 'متن‌های خواندنت:'
          : en
            ? 'You have no reading texts yet.'
            : 'هنوز متنی برای خواندن نداری.',
        markup: [
          ...texts.map((t) => [
            { text: t.title.slice(0, 60), callback_data: `E:rt:${t.id}` },
          ]),
          [
            {
              text: en ? 'New text with AI' : 'متن تازه با هوش مصنوعی',
              callback_data: 'E:rn',
            },
          ],
        ],
      },
    ];
  }

  private readingOuts(title: string, body: string): Out[] {
    const parts = chunks(`${title}\n\n${body}`).slice(0, 5);
    return parts.map((text) => ({ text }));
  }

  // ======================================================================= expenses

  private async expensesMenu(ctx: SectionContext): Promise<Out[]> {
    const L = ctx.language;
    const en = L === 'en';
    const report = await this.expenses.getReport(ctx.userId, {
      preset: 'this_month',
    });
    const over = report.byCategory.filter((c) => c.overBudget);
    const lines = [
      en
        ? `This month: ${toman(L, report.totalAmount)} (today ${toman(L, report.todayAmount)})`
        : `این ماه: ${toman(L, report.totalAmount)} (امروز ${toman(L, report.todayAmount)})`,
      ...over.map((c) => this.overLine(L, c.name, c.budgetUsedPercent)),
    ];
    return [
      {
        text: lines.join('\n'),
        markup: [
          [{ text: en ? 'Add expenses' : 'ثبت هزینه', callback_data: 'X:a' }],
          [
            { text: en ? 'Month report' : 'گزارش ماه', callback_data: 'X:r' },
            { text: en ? 'Budgets' : 'بودجه‌ها', callback_data: 'X:b' },
          ],
        ],
      },
    ];
  }

  private overLine(L: Lang, name: string, percent: number | null) {
    return L === 'en'
      ? `⚠️ «${name}» is over its monthly budget (${percent ?? 100}%).`
      : `⚠️ بودجهٔ ماهانهٔ «${name}» رد شد (${num('fa', percent ?? 100)}٪).`;
  }

  private async reportOut(L: Lang, userId: string): Promise<Out> {
    const en = L === 'en';
    const report: ExpenseReport = await this.expenses.getReport(userId, {
      preset: 'this_month',
    });
    const lines = [
      en
        ? `${formatDay(L, report.from)} to ${formatDay(L, report.to)}`
        : `${formatDay(L, report.from)} تا ${formatDay(L, report.to)}`,
      en
        ? `Total: ${toman(L, report.totalAmount)} in ${report.transactionCount} expenses`
        : `جمع: ${toman(L, report.totalAmount)} در ${num(L, report.transactionCount)} هزینه`,
      en
        ? `Daily average: ${toman(L, Math.round(report.dailyAverage))}`
        : `میانگین روزانه: ${toman(L, Math.round(report.dailyAverage))}`,
      '',
      ...report.byCategory
        .filter((c) => c.amount > 0)
        .slice(0, 10)
        .map((c) => {
          const budget =
            c.budgetUsedPercent != null
              ? en
                ? `, ${c.budgetUsedPercent}% of budget`
                : `، ${num(L, c.budgetUsedPercent)}٪ بودجه`
              : '';
          return `${c.overBudget ? '⚠️' : '•'} ${c.name}: ${toman(L, c.amount)} (${num(L, Math.round(c.percentage))}${en ? '%' : '٪'}${budget})`;
        }),
    ];
    return { text: lines.join('\n').trim() };
  }

  private async budgetsOut(L: Lang, userId: string): Promise<Out> {
    const en = L === 'en';
    const [categories, report] = await Promise.all([
      this.expenses.listCategories(userId),
      this.expenses.getReport(userId, { preset: 'this_month' }),
    ]);
    const spent = new Map(report.byCategory.map((c) => [c.categoryId, c]));
    const lines = categories.map((c) => {
      const used = spent.get(c.id);
      const amount = used?.amount ?? 0;
      return c.monthlyBudget
        ? `${used?.overBudget ? '⚠️' : '•'} ${c.name}: ${toman(L, amount)} ${en ? 'of' : 'از'} ${toman(L, c.monthlyBudget)}`
        : `• ${c.name}: ${toman(L, amount)} (${en ? 'no budget' : 'بدون بودجه'})`;
    });
    return {
      text: `${en ? 'Monthly budgets (tap a category to set one):' : 'بودجهٔ ماهانه (برای تعیین، دسته را بزن):'}\n${lines.join('\n')}`.slice(
        0,
        3900,
      ),
      markup: this.rows(
        categories.slice(0, 20).map((c) => ({
          text: c.name.slice(0, 30),
          callback_data: `X:bs:${c.id}`,
        })),
      ),
    };
  }

  /**
   * «Title amount» lines are saved directly; the category comes from the expenses decision model, as in the app.
   * Anything else goes to the assistant, which needs AI access.
   */
  private async addExpenses(ctx: SectionContext, text: string): Promise<Out[]> {
    const L = ctx.language;
    const en = L === 'en';
    const items = parseExpenseLines(text);
    if (!items)
      return [
        await this.viaAssistant(
          ctx,
          en
            ? `Log these expenses: ${text}`
            : `این هزینه‌ها را ثبت کن: ${text}`,
        ),
      ];
    const saved = [];
    for (const item of items)
      saved.push(
        await this.expenses.createExpense(
          ctx.userId,
          createExpenseSchema.parse(item),
        ),
      );
    const report = await this.expenses.getReport(ctx.userId, {
      preset: 'this_month',
    });
    const touched = new Set(saved.map((x) => x.categoryId));
    const over = report.byCategory.filter(
      (c) => c.overBudget && touched.has(c.categoryId),
    );
    return [
      {
        text: [
          en ? 'Saved:' : 'ثبت شد:',
          ...saved.map(
            (x) => `• ${x.title}: ${toman(L, x.amount)} (${x.categoryName})`,
          ),
          ...over.map((c) => this.overLine(L, c.name, c.budgetUsedPercent)),
        ].join('\n'),
        markup: [
          [
            { text: en ? 'Add more' : 'ثبت هزینهٔ دیگر', callback_data: 'X:a' },
            { text: en ? 'Month report' : 'گزارش ماه', callback_data: 'X:r' },
          ],
        ],
      },
    ];
  }

  /** Free text through the assistant: its tools, scope check and daily limits (errors are thrown). */
  private async viaAssistant(
    ctx: SectionContext,
    content: string,
  ): Promise<Out> {
    const reply = await this.assistant.chat(ctx.userId, {
      language: ctx.language,
      messages: [{ role: 'user', content: content.slice(0, 4000) }],
    });
    return { text: plainReply(reply.reply) };
  }
}
