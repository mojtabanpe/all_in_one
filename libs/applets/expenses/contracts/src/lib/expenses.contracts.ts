import * as z from 'zod/mini';

export const EXPENSE_CATEGORY_COLORS = [
  'emerald',
  'blue',
  'violet',
  'amber',
  'rose',
  'cyan',
  'slate',
] as const;
export type ExpenseCategoryColor = (typeof EXPENSE_CATEGORY_COLORS)[number];

export const EXPENSE_CATEGORY_COLOR_LABELS: Record<
  ExpenseCategoryColor,
  string
> = {
  emerald: 'سبز',
  blue: 'آبی',
  violet: 'بنفش',
  amber: 'کهربایی',
  rose: 'سرخابی',
  cyan: 'فیروزه‌ای',
  slate: 'خاکستری',
};

export const EXPENSE_CATEGORY_ICONS = [
  'lucideUtensils',
  'lucideCar',
  'lucideReceipt',
  'lucideShoppingBag',
  'lucideHeartPulse',
  'lucideSparkles',
  'lucideWallet',
  'lucideGraduationCap',
  'lucideHouse',
  'lucideGift',
  'lucideCoffee',
  'lucidePlane',
] as const;
export type ExpenseCategoryIcon = (typeof EXPENSE_CATEGORY_ICONS)[number];

export const EXPENSE_CATEGORY_ICON_LABELS: Record<ExpenseCategoryIcon, string> =
  {
    lucideUtensils: 'خوراک',
    lucideCar: 'حمل‌ونقل',
    lucideReceipt: 'قبض و رسید',
    lucideShoppingBag: 'خرید',
    lucideHeartPulse: 'سلامت',
    lucideSparkles: 'تفریح',
    lucideWallet: 'کیف پول',
    lucideGraduationCap: 'آموزش',
    lucideHouse: 'خانه',
    lucideGift: 'هدیه',
    lucideCoffee: 'کافه',
    lucidePlane: 'سفر',
  };

export const EXPENSE_DECISION_SOURCES = [
  'user',
  'local',
  'jev',
  'chat',
  'keywords',
  'fallback',
] as const;
export type ExpenseDecisionSource = (typeof EXPENSE_DECISION_SOURCES)[number];

export const EXPENSE_DECISION_LABELS: Record<ExpenseDecisionSource, string> = {
  user: 'انتخاب شما',
  local: 'مدل تصمیم‌گیر محلی',
  jev: 'مدل تصمیم‌گیر Jev',
  chat: 'مدل تصمیم‌گیر هوشمند',
  keywords: 'تشخیص کلیدواژه',
  fallback: 'دستهٔ پیش‌فرض',
};

export const EXPENSE_REPORT_PRESETS = [
  'today',
  'last7day',
  'last30day',
  'last90day',
  'this_month',
] as const;
export type ExpenseReportPreset = (typeof EXPENSE_REPORT_PRESETS)[number];

export interface DefaultExpenseCategorySeed {
  slug: string;
  name: string;
  color: ExpenseCategoryColor;
  icon: ExpenseCategoryIcon;
  keywords: string;
  sortOrder: number;
}

export const DEFAULT_EXPENSE_CATEGORIES: readonly DefaultExpenseCategorySeed[] =
  [
    {
      slug: 'food',
      name: 'خوراک و سوپرمارکت',
      color: 'emerald',
      icon: 'lucideUtensils',
      keywords:
        'غذا، ناهار، شام، صبحانه، رستوران، کافه، قهوه، سوپرمارکت، نان، میوه، سبزی، گوشت، مرغ، پروتئین، لبنیات، شیر، پنیر، اسنپ‌فود، چای، شیرینی، بستنی، آبمیوه، کباب، پیتزا، ساندویچ، برنج، خوراکی، تنقلات، food, grocery, supermarket, restaurant, cafe, coffee, lunch, dinner, breakfast, snack, fruit, bread',
      sortOrder: 0,
    },
    {
      slug: 'transport',
      name: 'حمل‌ونقل و خودرو',
      color: 'blue',
      icon: 'lucideCar',
      keywords:
        'اسنپ، تپسی، تاکسی، مترو، اتوبوس، بنزین، سوخت، پارکینگ، کارواش، تعمیر ماشین، مکانیکی، تعویض روغن، روغن موتور، لاستیک، بیمه ماشین، عوارض، طرح ترافیک، پیک، موتور، بلیط قطار، پرواز، snapp, tapsi, taxi, uber, metro, bus, fuel, gas, car, parking, repair, transit',
      sortOrder: 1,
    },
    {
      slug: 'bills',
      name: 'مسکن و قبوض',
      color: 'amber',
      icon: 'lucideReceipt',
      keywords:
        'اجاره، اجاره‌بها، رهن، شارژ ساختمان، قبض برق، قبض آب، قبض گاز، قبض تلفن، اینترنت، بسته اینترنت، مودم، شارژ موبایل، سیم‌کارت، تعمیرات خانه، قسط، وام، مالیات، بیمه، rent, bill, electricity, water, gas, internet, mobile, phone, housing, mortgage, utility',
      sortOrder: 2,
    },
    {
      slug: 'shopping',
      name: 'خرید و پوشاک',
      color: 'violet',
      icon: 'lucideShoppingBag',
      keywords:
        'لباس، کفش، شلوار، پیراهن، مانتو، کاپشن، پوشاک، کیف، ساعت، عطر، ادکلن، آرایشی، بهداشتی، شامپو، لوازم خانه، دیجی‌کالا، ترب، هدیه، کادو، موبایل، لپ‌تاپ، هدفون، شارژر، لوازم جانبی، clothes, shoes, shopping, digikala, gift, electronics, cosmetics, home',
      sortOrder: 3,
    },
    {
      slug: 'health',
      name: 'سلامت و درمان',
      color: 'rose',
      icon: 'lucideHeartPulse',
      keywords:
        'داروخانه، دارو، قرص، شربت، دکتر، پزشک، ویزیت، آزمایش، آزمایشگاه، دندان‌پزشکی، بیمارستان، درمانگاه، کلینیک، عینک، مکمل، ویتامین، باشگاه، شهریه ورزش، استخر، فیزیوتراپی، مشاوره، روانشناس، pharmacy, medicine, doctor, dentist, hospital, lab, gym, fitness, health, therapy',
      sortOrder: 4,
    },
    {
      slug: 'entertainment',
      name: 'تفریح و اشتراک‌ها',
      color: 'cyan',
      icon: 'lucideSparkles',
      keywords:
        'سینما، تئاتر، کنسرت، سفر، مسافرت، هتل، اقامتگاه، تفریح، شهربازی، بولینگ، بازی، گیم، کتاب، مجله، دوره آموزشی، کلاس، اشتراک، فیلیمو، نماوا، اسپاتیفای، یوتیوب، تلگرام پرمیوم، چت‌جی‌پی‌تی، سرور، دامنه، cinema, movie, concert, travel, hotel, game, book, course, subscription, streaming',
      sortOrder: 5,
    },
    {
      slug: 'other',
      name: 'سایر مخارج',
      color: 'slate',
      icon: 'lucideWallet',
      keywords:
        'سایر، متفرقه، کارمزد، انتقال وجه، کارت به کارت، صدقه، خیریه، دستمزد، انعام، غیره، other, miscellaneous, fee, charity, tip',
      sortOrder: 6,
    },
  ];

export interface ExpenseCategory {
  id: string;
  name: string;
  slug: string | null;
  color: ExpenseCategoryColor;
  icon: ExpenseCategoryIcon;
  keywords: string;
  monthlyBudget: number | null;
  sortOrder: number;
}

export interface ExpenseItem {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: ExpenseCategoryColor;
  categoryIcon: ExpenseCategoryIcon;
  title: string;
  amount: number;
  date: string;
  note: string | null;
  decidedBy: ExpenseDecisionSource;
  createdAt: string;
}

export interface ExpenseClassificationResult {
  categoryId: string;
  categoryName: string;
  decidedBy: ExpenseDecisionSource;
  confidence: number | null;
}

export type ExpenseCategoryItem = ExpenseCategory;
export type ClassifyExpenseResult = ExpenseClassificationResult;

export interface ExpenseCategoryBreakdown {
  categoryId: string;
  name: string;
  color: ExpenseCategoryColor;
  icon: ExpenseCategoryIcon;
  amount: number;
  count: number;
  percentage: number;
  monthlyBudget: number | null;
  budgetUsedPercent: number | null;
  overBudget: boolean;
}

export interface ExpenseDailyTotal {
  date: string;
  amount: number;
  count: number;
}

export interface ExpenseReport {
  from: string;
  to: string;
  daysCount: number;
  totalAmount: number;
  dailyAverage: number;
  todayAmount: number;
  transactionCount: number;
  topCategory: {
    categoryId: string;
    name: string;
    amount: number;
    percentage: number;
  } | null;
  byCategory: ExpenseCategoryBreakdown[];
  dailySeries: ExpenseDailyTotal[];
  biggestExpenses: ExpenseItem[];
}

export const MAX_EXPENSE_AMOUNT = 1_000_000_000_000;

export const createExpenseCategorySchema = z.object({
  name: z.string().check(z.trim(), z.minLength(1), z.maxLength(80)),
  slug: z.optional(z.nullable(z.string().check(z.trim(), z.maxLength(32)))),
  color: z.optional(z.enum(EXPENSE_CATEGORY_COLORS)),
  icon: z.optional(z.enum(EXPENSE_CATEGORY_ICONS)),
  keywords: z.optional(z.string().check(z.trim(), z.maxLength(500))),
  monthlyBudget: z.optional(
    z.nullable(z.int().check(z.gte(1), z.lte(MAX_EXPENSE_AMOUNT))),
  ),
});
export type CreateExpenseCategoryInput = z.infer<
  typeof createExpenseCategorySchema
>;

export const updateExpenseCategorySchema = z.object({
  name: z.optional(z.string().check(z.trim(), z.minLength(1), z.maxLength(80))),
  slug: z.optional(z.nullable(z.string().check(z.trim(), z.maxLength(32)))),
  color: z.optional(z.enum(EXPENSE_CATEGORY_COLORS)),
  icon: z.optional(z.enum(EXPENSE_CATEGORY_ICONS)),
  keywords: z.optional(z.string().check(z.trim(), z.maxLength(500))),
  monthlyBudget: z.optional(
    z.nullable(z.int().check(z.gte(1), z.lte(MAX_EXPENSE_AMOUNT))),
  ),
});
export type UpdateExpenseCategoryInput = z.infer<
  typeof updateExpenseCategorySchema
>;

export const createExpenseSchema = z.object({
  title: z.string().check(z.trim(), z.minLength(1), z.maxLength(160)),
  amount: z.int().check(z.gte(1), z.lte(MAX_EXPENSE_AMOUNT)),
  date: z.optional(z.iso.date()),
  categoryId: z.optional(z.nullable(z.uuid())),
  note: z.optional(z.nullable(z.string().check(z.trim(), z.maxLength(1000)))),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const createExpensesBatchSchema = z.object({
  expenses: z.array(createExpenseSchema).check(z.minLength(1), z.maxLength(30)),
});
export type CreateExpensesBatchInput = z.infer<
  typeof createExpensesBatchSchema
>;

export const updateExpenseSchema = z.object({
  title: z.optional(
    z.string().check(z.trim(), z.minLength(1), z.maxLength(160)),
  ),
  amount: z.optional(z.int().check(z.gte(1), z.lte(MAX_EXPENSE_AMOUNT))),
  date: z.optional(z.iso.date()),
  categoryId: z.optional(z.uuid()),
  note: z.optional(z.nullable(z.string().check(z.trim(), z.maxLength(1000)))),
});
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const classifyExpenseSchema = z.object({
  title: z.string().check(z.trim(), z.minLength(1), z.maxLength(160)),
  note: z.optional(z.nullable(z.string().check(z.trim(), z.maxLength(1000)))),
});
export type ClassifyExpenseInput = z.infer<typeof classifyExpenseSchema>;

export const expenseQuerySchema = z.object({
  preset: z.optional(z.enum(EXPENSE_REPORT_PRESETS)),
  from: z.optional(z.iso.date()),
  to: z.optional(z.iso.date()),
  categoryId: z.optional(z.uuid()),
  search: z.optional(z.string().check(z.trim(), z.maxLength(160))),
  limit: z.optional(z.coerce.number().check(z.int(), z.gte(1), z.lte(500))),
});
export type ExpenseQueryInput = z.infer<typeof expenseQuerySchema>;

/** Tehran calendar day (YYYY-MM-DD) for a Date. */
export function tehranIsoDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Shifts an ISO calendar date (`YYYY-MM-DD`) by `days`. */
export function shiftIsoDate(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Day of the current Solar Hijri month (1..31) for an ISO date, so `this_month` starts on day 1 of the Persian month. */
export function jalaliDayOfMonth(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    timeZone: 'UTC',
    day: 'numeric',
  }).formatToParts(new Date(`${iso}T12:00:00Z`));
  const day = Number(parts.find((p) => p.type === 'day')?.value ?? '1');
  return Number.isFinite(day) && day >= 1 ? day : 1;
}

/** Resolves a preset or explicit `from`/`to` into a bounded `[from, to]` ISO date range (at most 366 days). */
export function resolveExpenseDateRange(
  query: {
    preset?: ExpenseReportPreset;
    from?: string;
    to?: string;
  },
  today: string = tehranIsoDate(),
): { from: string; to: string } {
  if (query.from && query.to) {
    const start = query.from <= query.to ? query.from : query.to;
    const end = query.from <= query.to ? query.to : query.from;
    const minFrom = shiftIsoDate(end, -365);
    return { from: start < minFrom ? minFrom : start, to: end };
  }
  const preset = query.preset ?? 'this_month';
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'last7day':
      return { from: shiftIsoDate(today, -6), to: today };
    case 'last30day':
      return { from: shiftIsoDate(today, -29), to: today };
    case 'last90day':
      return { from: shiftIsoDate(today, -89), to: today };
    case 'this_month':
    default: {
      const dayOfMonth = jalaliDayOfMonth(today);
      return { from: shiftIsoDate(today, -(dayOfMonth - 1)), to: today };
    }
  }
}

/** Builds a descriptive candidate text for a category so embedding/decision models can match expenses accurately. */
export function buildCategoryCandidateText(
  category: Pick<ExpenseCategory, 'name' | 'slug' | 'keywords'>,
): string {
  const seed = DEFAULT_EXPENSE_CATEGORIES.find(
    (item) => item.slug === category.slug || item.name === category.name,
  );
  const keywords = [category.keywords, seed?.keywords]
    .filter(Boolean)
    .join('، ');
  return keywords
    ? `دسته‌بندی مخارج: ${category.name} (${keywords})`
    : `دسته‌بندی مخارج: ${category.name}`;
}

function normalizeTokens(text: string): string {
  return text
    .toLowerCase()
    .replace(/\u200c/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deterministic keyword & token matcher across the user's categories.
 * Used when the decision model is offline or returns a low-confidence result.
 */
export function matchExpenseCategoryByKeywords(
  expenseText: string,
  categories: readonly Pick<
    ExpenseCategory,
    'id' | 'name' | 'slug' | 'keywords'
  >[],
): { categoryId: string; score: number } | null {
  const normalizedExpense = normalizeTokens(expenseText);
  if (!normalizedExpense || !categories.length) return null;
  const expenseWords = new Set(normalizedExpense.split(' ').filter(Boolean));

  let bestId: string | null = null;
  let bestScore = 0;

  for (const category of categories) {
    const seed = DEFAULT_EXPENSE_CATEGORIES.find(
      (item) => item.slug === category.slug || item.name === category.name,
    );
    const rawKeywords = [category.name, category.keywords, seed?.keywords ?? '']
      .filter(Boolean)
      .join('،');
    const phrases = rawKeywords
      .split(/[،,;|\n]+/)
      .map((item) => normalizeTokens(item))
      .filter((item) => item.length >= 2);

    let score = 0;
    for (const phrase of phrases) {
      if (normalizedExpense === phrase) {
        score += 5;
      } else if (phrase.includes(' ') && normalizedExpense.includes(phrase)) {
        score += 3.5;
      } else if (expenseWords.has(phrase)) {
        score += 2.5;
      } else if (phrase.length >= 3 && normalizedExpense.includes(phrase)) {
        score += 1.5;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestId = category.id;
    }
  }

  return bestId && bestScore >= 1.5
    ? { categoryId: bestId, score: bestScore }
    : null;
}

/** Pure calculation of the expense report for a date range. */
export function computeExpenseReport(
  expenses: readonly ExpenseItem[],
  categories: readonly ExpenseCategory[],
  from: string,
  to: string,
  todayAmount: number,
): ExpenseReport {
  const startMs = Date.parse(`${from}T00:00:00Z`);
  const endMs = Date.parse(`${to}T00:00:00Z`);
  const daysCount = Math.max(
    1,
    Math.min(366, Math.round((endMs - startMs) / 86_400_000) + 1),
  );

  const totalAmount = expenses.reduce((sum, item) => sum + item.amount, 0);
  const transactionCount = expenses.length;
  const dailyAverage = Math.round(totalAmount / daysCount);

  const byCatMap = new Map<
    string,
    { category: ExpenseCategory; amount: number; count: number }
  >();
  for (const cat of categories) {
    byCatMap.set(cat.id, { category: cat, amount: 0, count: 0 });
  }
  for (const item of expenses) {
    const existing = byCatMap.get(item.categoryId);
    if (existing) {
      existing.amount += item.amount;
      existing.count += 1;
    } else {
      byCatMap.set(item.categoryId, {
        category: {
          id: item.categoryId,
          name: item.categoryName,
          slug: null,
          color: item.categoryColor,
          icon: item.categoryIcon,
          keywords: '',
          monthlyBudget: null,
          sortOrder: 999,
        },
        amount: item.amount,
        count: 1,
      });
    }
  }

  const byCategory: ExpenseCategoryBreakdown[] = [...byCatMap.values()]
    .map(({ category, amount, count }) => {
      const percentage =
        totalAmount > 0 ? Math.round((amount / totalAmount) * 100) : 0;
      const monthlyBudget = category.monthlyBudget;
      const budgetUsedPercent =
        monthlyBudget && monthlyBudget > 0
          ? Math.round((amount / monthlyBudget) * 100)
          : null;
      return {
        categoryId: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
        amount,
        count,
        percentage,
        monthlyBudget,
        budgetUsedPercent,
        overBudget:
          monthlyBudget !== null && monthlyBudget > 0 && amount > monthlyBudget,
      };
    })
    .sort((a, b) => b.amount - a.amount || b.count - a.count);

  const firstWithSpend = byCategory.find((c) => c.amount > 0) ?? null;
  const topCategory = firstWithSpend
    ? {
        categoryId: firstWithSpend.categoryId,
        name: firstWithSpend.name,
        amount: firstWithSpend.amount,
        percentage: firstWithSpend.percentage,
      }
    : null;

  const dailyMap = new Map<string, { amount: number; count: number }>();
  for (let i = 0; i < daysCount; i++) {
    dailyMap.set(shiftIsoDate(from, i), { amount: 0, count: 0 });
  }
  for (const item of expenses) {
    const day = dailyMap.get(item.date);
    if (day) {
      day.amount += item.amount;
      day.count += 1;
    }
  }
  const dailySeries: ExpenseDailyTotal[] = [...dailyMap.entries()].map(
    ([date, stats]) => ({
      date,
      amount: stats.amount,
      count: stats.count,
    }),
  );

  const biggestExpenses = [...expenses]
    .sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date))
    .slice(0, 5);

  return {
    from,
    to,
    daysCount,
    totalAmount,
    dailyAverage,
    todayAmount,
    transactionCount,
    topCategory,
    byCategory,
    dailySeries,
    biggestExpenses,
  };
}
