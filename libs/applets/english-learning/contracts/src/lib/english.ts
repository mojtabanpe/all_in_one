/**
 * English applet contracts, ported from Recall (github.com/mojtabanpe/flashcard):
 * decks and cards with SM-2 scheduling and Leitner leeches, reading texts,
 * practice (writing, listening) and the AI request/response shapes.
 * Shared by the api and web sides; pure logic only.
 */
import * as z from 'zod/mini';

/* ---------------- Decks and cards ---------------- */

export const DECK_COLORS = [
  'amber',
  'rose',
  'sage',
  'sky',
  'violet',
  'clay',
] as const;
export type DeckColor = (typeof DECK_COLORS)[number];
export const DECK_COLOR_LABELS: Record<DeckColor, string> = {
  amber: 'کهربایی',
  rose: 'صورتی',
  sage: 'سبز',
  sky: 'آبی',
  violet: 'بنفش',
  clay: 'سفالی',
};

export interface Deck {
  id: string;
  name: string;
  description: string;
  color: DeckColor;
  createdAt: string;
  updatedAt: string;
}

/** A deck plus study counts, for the library. */
export interface DeckWithStats extends Deck {
  total: number;
  due: number;
  suspended: number;
}

export interface Card {
  id: string;
  deckId: string;
  front: string;
  back: string;
  /** Unit badge, separate from the answer (e.g. u19). */
  unit: string;
  /** Markdown list of examples, revealed only on request. */
  examples: string;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  /** Times this card was rated "again"; Leitner uses it to find leeches. */
  lapses: number;
  /** Leeches (or manually hidden cards) leave the review rotation. */
  suspended: boolean;
  /** How many times this card has been suspended. */
  suspensions: number;
  dueAt: string;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const deckName = z.string().check(z.trim(), z.minLength(1), z.maxLength(200));
const deckDescription = z.string().check(z.trim(), z.maxLength(10000));
const cardText = z.string().check(z.trim(), z.minLength(1), z.maxLength(100000));
const unit = z.string().check(z.trim(), z.regex(/^(?:[uU]\d+)?$/));
const examples = z.string().check(z.trim(), z.maxLength(100000));

export const createDeckSchema = z.object({
  name: deckName,
  description: z.optional(deckDescription),
  color: z._default(z.enum(DECK_COLORS), 'sky'),
});
export type CreateDeckInput = z.input<typeof createDeckSchema>;

export const updateDeckSchema = z.partial(
  z.object({
    name: deckName,
    description: deckDescription,
    color: z.enum(DECK_COLORS),
  }),
);
export type UpdateDeckInput = z.infer<typeof updateDeckSchema>;

export const createCardSchema = z.object({
  deckId: z.uuid(),
  front: cardText,
  back: cardText,
  unit: z.optional(unit),
  examples: z.optional(examples),
});
export type CreateCardInput = z.infer<typeof createCardSchema>;

export const updateCardSchema = z.partial(
  z.object({ front: cardText, back: cardText, unit, examples }),
);
export type UpdateCardInput = z.infer<typeof updateCardSchema>;

export const moveCardSchema = z.object({ deckId: z.uuid() });

export const listCardsQuerySchema = z.object({
  deckId: z.uuid(),
  due: z.optional(z.enum(['true', 'false'])),
});

export const searchCardsQuerySchema = z.object({
  q: z.string().check(z.trim(), z.minLength(1), z.maxLength(200)),
  deckId: z.optional(z.uuid()),
});

/* ---------------- Spaced repetition (SM-2 + Leitner) ---------------- */

export const RATINGS = ['again', 'hard', 'good', 'easy'] as const;
/** How well the user recalled a card during review. */
export type Rating = (typeof RATINGS)[number];
export const RATING_LABELS: Record<Rating, string> = {
  again: 'دوباره',
  hard: 'سخت',
  good: 'خوب',
  easy: 'آسان',
};

export const reviewSchema = z.object({ rating: z.enum(RATINGS) });
export type ReviewInput = z.infer<typeof reviewSchema>;

/** The part of a card the scheduler reads and writes. */
export interface SrsState {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueAt: string;
  lastReviewedAt: string | null;
}

const RATING_QUALITY: Record<Rating, number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/*
 * Leitner method: a card that keeps failing becomes a "leech" and leaves the
 * rotation so it stops burning study time (suspend after ~8 lapses with a
 * crushed ease factor); a card suspended twice is beyond salvage.
 */
export const LEITNER_LAPSE_THRESHOLD = 8;
export const LEITNER_MAX_SUSPENSIONS = 2;

export function isLeech(card: Pick<Card, 'lapses' | 'easeFactor'>): boolean {
  return card.lapses >= LEITNER_LAPSE_THRESHOLD && card.easeFactor <= 1.3;
}

export function isBeyondSalvage(card: Pick<Card, 'suspensions'>): boolean {
  return card.suspensions >= LEITNER_MAX_SUSPENSIONS;
}

/**
 * SM-2. "Again" resets the streak and brings the card back in 5 minutes; a
 * passing grade grows the interval by the ease factor ("hard" dampens it,
 * "easy" stretches it).
 */
export function schedule(
  card: Pick<Card, keyof SrsState>,
  rating: Rating,
  now = new Date(),
): SrsState {
  const quality = RATING_QUALITY[rating];
  let { easeFactor: ease, intervalDays: interval, repetitions } = card;
  const { lapses } = card;

  if (quality < 3) {
    return {
      easeFactor: Math.max(1.3, ease - 0.2),
      intervalDays: 0,
      repetitions: 0,
      lapses: lapses + 1,
      dueAt: new Date(now.getTime() + 5 * MINUTE).toISOString(),
      lastReviewedAt: now.toISOString(),
    };
  }

  if (repetitions === 0) interval = 1;
  else if (repetitions === 1) interval = 6;
  else interval = Math.round(interval * ease);
  if (rating === 'hard') interval = Math.max(1, Math.round(interval * 0.6));
  if (rating === 'easy') interval = Math.round(interval * 1.3);

  repetitions += 1;
  ease = Math.max(
    1.3,
    ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  return {
    easeFactor: Math.round(ease * 100) / 100,
    intervalDays: interval,
    repetitions,
    lapses,
    dueAt: new Date(now.getTime() + interval * DAY).toISOString(),
    lastReviewedAt: now.toISOString(),
  };
}

/** When the card comes back after this rating, for the rating buttons (Persian). */
export function previewInterval(
  card: Pick<Card, keyof SrsState>,
  rating: Rating,
): string {
  if (rating === 'again') return '۵ دقیقه';
  const days = schedule(card, rating).intervalDays;
  const fa = (n: number) => n.toLocaleString('fa-IR');
  if (days < 1) return 'کمتر از یک روز';
  if (days < 30) return `${fa(days)} روز`;
  if (days < 365) return `${fa(Math.round(days / 30))} ماه`;
  return `${fa(Math.round(days / 365))} سال`;
}

/* ---------------- Card text helpers ---------------- */

export interface UnitSplit {
  unit: string | null;
  body: string;
}

/** Older cards keep their unit at the start of the answer ("U1 a person who…"). */
export function splitUnit(back: string): UnitSplit {
  const match = back.match(/^u\d+\s+/i);
  if (!match) return { unit: null, body: back };
  return {
    unit: match[0].trim().toLowerCase(),
    body: back.slice(match[0].length),
  };
}

/** Prefer the unit field; fall back to a leading unit in the answer. */
export function cardParts(card: { back: string; unit?: string }): UnitSplit {
  const legacy = splitUnit(card.back);
  return { unit: card.unit?.toLowerCase() || legacy.unit, body: legacy.body };
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Every word of the query appears somewhere on the card; optional unit filter. */
export function matchesCard(
  card: Pick<Card, 'front' | 'back' | 'examples' | 'unit'>,
  query: string,
  unitFilter = '',
): boolean {
  const parts = cardParts(card);
  if (unitFilter && parts.unit !== unitFilter) return false;
  const text = normalize(
    [card.front, card.back, card.examples, parts.unit ?? ''].join(' '),
  );
  return normalize(query)
    .trim()
    .split(/\s+/)
    .every((word) => text.includes(word));
}

/* ---------------- Reading texts ---------------- */

/** A passage the user reads aloud and mines for vocabulary. */
export interface ReadingText {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  /** Written by AI; only these are rated. */
  ai: boolean;
  /** 1–5 stars, or null until rated. */
  rating: number | null;
  reviewNote: string;
  ratedAt: string | null;
}

export const createTextSchema = z.object({
  title: z.string().check(z.trim(), z.minLength(1), z.maxLength(200)),
  body: z.string().check(z.trim(), z.minLength(1), z.maxLength(50000)),
  ai: z.optional(z.boolean()),
});
export type CreateTextInput = z.input<typeof createTextSchema>;

export const updateTextSchema = z.partial(
  z.object({
    title: z.string().check(z.trim(), z.minLength(1), z.maxLength(200)),
    body: z.string().check(z.trim(), z.minLength(1), z.maxLength(50000)),
  }),
);

export const reviewTextSchema = z.object({
  rating: z.int().check(z.gte(1), z.lte(5)),
  note: z.optional(z.string().check(z.trim(), z.maxLength(2000))),
});
export type ReviewTextInput = z.input<typeof reviewTextSchema>;

/** Topics offered when generating a reading text (English goes to the AI). */
export const READING_TOPICS = [
  { id: 'technology', label: 'Technology', fa: 'فناوری' },
  { id: 'science', label: 'Science', fa: 'علم' },
  { id: 'health', label: 'Health & fitness', fa: 'سلامت و تناسب اندام' },
  { id: 'sports', label: 'Sports', fa: 'ورزش' },
  { id: 'travel', label: 'Travel', fa: 'سفر' },
  { id: 'food', label: 'Food & cooking', fa: 'غذا و آشپزی' },
  { id: 'business', label: 'Business & work', fa: 'کسب‌وکار و کار' },
  { id: 'money', label: 'Money & economy', fa: 'پول و اقتصاد' },
  { id: 'environment', label: 'Environment & nature', fa: 'محیط زیست و طبیعت' },
  { id: 'animals', label: 'Animals', fa: 'حیوانات' },
  { id: 'history', label: 'History', fa: 'تاریخ' },
  { id: 'culture', label: 'Culture & traditions', fa: 'فرهنگ و آداب' },
  { id: 'arts', label: 'Art & design', fa: 'هنر و طراحی' },
  { id: 'entertainment', label: 'Movies, music & books', fa: 'فیلم، موسیقی و کتاب' },
  { id: 'psychology', label: 'Psychology', fa: 'روان‌شناسی' },
  { id: 'education', label: 'Education & learning', fa: 'آموزش و یادگیری' },
  { id: 'space', label: 'Space & astronomy', fa: 'فضا و نجوم' },
  { id: 'relationships', label: 'Family & relationships', fa: 'خانواده و روابط' },
  { id: 'daily-life', label: 'Everyday life', fa: 'زندگی روزمره' },
  { id: 'story', label: 'Short story', fa: 'داستان کوتاه' },
] as const;
export type ReadingTopic = (typeof READING_TOPICS)[number]['id'];
const TOPIC_IDS = READING_TOPICS.map((t) => t.id) as [
  ReadingTopic,
  ...ReadingTopic[],
];

export const READING_LEVELS = [
  { id: 'B1', label: 'B1 (intermediate)', fa: 'متوسط (B1)' },
  { id: 'B2', label: 'B2 (upper-intermediate)', fa: 'بالاتر از متوسط (B2)' },
  { id: 'C1', label: 'C1 (advanced)', fa: 'پیشرفته (C1)' },
] as const;
export type ReadingLevel = (typeof READING_LEVELS)[number]['id'];
const LEVEL_IDS = READING_LEVELS.map((l) => l.id) as [
  ReadingLevel,
  ...ReadingLevel[],
];

/** A run of text in the reader; only `word` tokens can be looked up. */
export interface ReadingToken {
  id: number;
  text: string;
  word: boolean;
  /** Index into `ReadingDoc.sentences`. */
  sentence: number;
}

export interface ReadingDoc {
  paragraphs: ReadingToken[][];
  sentences: string[];
  /** Groups of consecutive sentence indices read aloud as one request. */
  chunks: number[][];
}

const WORD = /\p{L}(?:[\p{L}\p{M}'’-]*\p{L})?/gu;

function splitSentences(paragraph: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    return Array.from(segmenter.segment(paragraph), (s) => s.segment);
  }
  return paragraph.match(/[^.!?]+(?:[.!?]+["')\]]*\s*|$)/g) ?? [paragraph];
}

/**
 * Split text into paragraphs of word/space tokens tagged with their sentence,
 * and group sentences into chunks of at least `minChunk` characters (at most
 * `maxChunk`) so reading aloud stays within the speech rate limit.
 */
export function parseReading(
  body: string,
  minChunk = 220,
  maxChunk = 1800,
): ReadingDoc {
  const paragraphs: ReadingToken[][] = [];
  const sentences: string[] = [];
  let id = 0;
  for (const paragraph of body.split(/\n\s*\n|\r\n\s*\r\n/)) {
    if (!paragraph.trim()) continue;
    const tokens: ReadingToken[] = [];
    for (const sentence of splitSentences(paragraph)) {
      if (!sentence.trim()) {
        tokens.push({
          id: id++,
          text: sentence,
          word: false,
          sentence: Math.max(0, sentences.length - 1),
        });
        continue;
      }
      const index = sentences.length;
      sentences.push(sentence.trim());
      let last = 0;
      for (const match of sentence.matchAll(WORD)) {
        if (match.index > last)
          tokens.push({
            id: id++,
            text: sentence.slice(last, match.index),
            word: false,
            sentence: index,
          });
        tokens.push({ id: id++, text: match[0], word: true, sentence: index });
        last = match.index + match[0].length;
      }
      if (last < sentence.length)
        tokens.push({
          id: id++,
          text: sentence.slice(last),
          word: false,
          sentence: index,
        });
    }
    paragraphs.push(tokens);
  }
  const chunks: number[][] = [];
  let current: number[] = [];
  let length = 0;
  sentences.forEach((sentence, index) => {
    if (current.length && length + sentence.length > maxChunk) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(index);
    length += sentence.length + 1;
    if (length >= minChunk) {
      chunks.push(current);
      current = [];
      length = 0;
    }
  });
  if (current.length) chunks.push(current);
  return { paragraphs, sentences, chunks };
}

/* ---------------- AI ---------------- */

export const cardAnswerRequestSchema = z.object({
  front: z.string().check(z.trim(), z.minLength(1), z.maxLength(500)),
  deck: z.optional(z.string().check(z.maxLength(120))),
  context: z.optional(z.string().check(z.maxLength(1000))),
});
export type CardAnswerRequest = z.input<typeof cardAnswerRequestSchema>;
export interface CardAnswer {
  front: string;
  back: string;
  examples: string;
}

export const readingTextRequestSchema = z.object({
  topic: z.enum(TOPIC_IDS),
  level: z.optional(z.enum(LEVEL_IDS)),
});
export type ReadingTextRequest = z.input<typeof readingTextRequestSchema>;
export interface GeneratedText {
  title: string;
  body: string;
  /** Title of the rated text whose feedback steered this one. */
  feedbackFrom?: string;
}

/* ---------------- Practice ---------------- */

/** Everyday situations for conversation practice (writing and listening). */
export const CONVERSATION_SITUATIONS = [
  { id: 'small-talk', label: 'Small talk', fa: 'گپ کوتاه' },
  { id: 'cafe', label: 'Café & restaurant', fa: 'کافه و رستوران' },
  { id: 'shopping', label: 'Shopping', fa: 'خرید' },
  { id: 'plans', label: 'Making plans with friends', fa: 'برنامه با دوستان' },
  { id: 'texting', label: 'Texting a friend', fa: 'پیام به دوست' },
  { id: 'work', label: 'At work', fa: 'سر کار' },
  { id: 'doctor', label: 'Doctor & pharmacy', fa: 'دکتر و داروخانه' },
  { id: 'directions', label: 'Travel & directions', fa: 'سفر و آدرس' },
  { id: 'hotel', label: 'Hotel & booking', fa: 'هتل و رزرو' },
  { id: 'phone', label: 'Phone calls & appointments', fa: 'تلفن و وقت گرفتن' },
  { id: 'home', label: 'Neighbours & home', fa: 'همسایه و خانه' },
  { id: 'problems', label: 'Problems & complaints', fa: 'مشکل و شکایت' },
  { id: 'feelings', label: 'Feelings & opinions', fa: 'احساس و نظر' },
  { id: 'family', label: 'Family & friends', fa: 'خانواده و دوستان' },
] as const;
export type ConversationSituation =
  (typeof CONVERSATION_SITUATIONS)[number]['id'];
const SITUATION_IDS = CONVERSATION_SITUATIONS.map((s) => s.id) as [
  ConversationSituation,
  ...ConversationSituation[],
];

export const practiceRequestSchema = z.object({
  situation: z.enum(SITUATION_IDS),
  level: z.optional(z.enum(LEVEL_IDS)),
});
export type PracticeRequest = z.input<typeof practiceRequestSchema>;

export const writingFeedbackRequestSchema = z.object({
  situation: z.enum(SITUATION_IDS),
  level: z.optional(z.enum(LEVEL_IDS)),
  scenario: z.string().check(z.trim(), z.minLength(1), z.maxLength(600)),
  message: z.optional(z.string().check(z.maxLength(600))),
  answer: z.string().check(z.trim(), z.minLength(1), z.maxLength(3000)),
});
export type WritingFeedbackRequest = z.input<
  typeof writingFeedbackRequestSchema
>;

export interface UsefulPhrase {
  phrase: string;
  meaning: string;
}

/** A short everyday writing task: the situation and what the other person said. */
export interface WritingTask {
  scenario: string;
  /** The other person's words the learner answers; may be empty. */
  message: string;
}

export interface WritingFeedback {
  /** The learner's text with only the mistakes fixed. */
  corrected: string;
  /** How a native speaker would naturally say it. */
  natural: string;
  mistakes: { original: string; fix: string; why: string }[];
  phrases: UsefulPhrase[];
  comment: string;
}

/** A short everyday conversation for listening practice. */
export interface Dialogue {
  title: string;
  lines: { speaker: string; text: string }[];
  questions: { question: string; options: string[]; answer: number }[];
  phrases: UsefulPhrase[];
}

/* ---------------- Speech ---------------- */

export const SPEECH_VOICES = ['primary', 'secondary'] as const;
export type SpeechVoice = (typeof SPEECH_VOICES)[number];
export const speechRequestSchema = z.object({
  text: z.string().check(z.trim(), z.minLength(1), z.maxLength(2000)),
  voice: z.optional(z.enum(SPEECH_VOICES)),
});
export type SpeechRequest = z.input<typeof speechRequestSchema>;

export interface Transcript {
  text: string;
}

/* ---------------- Starter decks and stats ---------------- */

/** A ready-made CEFR deck the user can copy into their library. */
export interface StarterDeck {
  slug: string;
  title: string;
  description: string;
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
  color: DeckColor;
  cardCount: number;
}

export interface EnglishStats {
  /** Cards due now across all decks. */
  due: number;
  total: number;
  /** Cards with an interval of three weeks or more. */
  mature: number;
  reviewedToday: number;
  /** Consecutive days with at least one review, ending today or yesterday. */
  streakDays: number;
}

/** Streak from review days (YYYY-MM-DD, any order), counted back from `today`. */
export function streakFrom(days: readonly string[], today: string): number {
  const set = new Set(days);
  const cursor = new Date(`${today}T00:00:00Z`);
  if (!set.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
