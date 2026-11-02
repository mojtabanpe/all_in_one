import * as z from 'zod/mini';

/*
 * Shadowing check (owner, 2026-11-02): every recording is transcribed by the
 * user's speech-to-text service and compared word by word with the sentence.
 * This catches words that were skipped, swapped or not understood; it does not
 * grade accent or intonation (a transcript cannot show those).
 */

export type ShadowWordStatus = 'ok' | 'missed' | 'wrong';

export interface ShadowWord {
  /** The word as written in the sentence (with its punctuation). */
  word: string;
  status: ShadowWordStatus;
  /** What was heard instead, for `wrong`. */
  heard?: string;
}

export interface ShadowCheck {
  words: ShadowWord[];
  /** Words heard that are not in the sentence. */
  extra: string[];
  /** The transcript, as returned by speech-to-text. */
  heard: string;
  /** 0–100, strict: see `shadowScore`. */
  score: number;
}

const SMALL = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

function numberWords(n: number): string[] {
  if (n < 20) return [SMALL[n]];
  if (n < 100)
    return n % 10 ? [TENS[Math.floor(n / 10)], SMALL[n % 10]] : [TENS[n / 10]];
  return String(n).split('');
}

const CONTRACTIONS: Record<string, string> = {
  "can't": 'can not',
  cannot: 'can not',
  "won't": 'will not',
  "shan't": 'shall not',
  "i'm": 'i am',
  "let's": 'let us',
};
const SUFFIXES: [string, string][] = [
  ["n't", ' not'],
  ["'re", ' are'],
  ["'ve", ' have'],
  ["'ll", ' will'],
  ["'d", ' would'],
];
const SAME: Record<string, string> = { okay: 'ok', alright: 'all right' };

/** Lower-case words without punctuation; contractions and small numbers spelled out. */
export function shadowTokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().replace(/[’‘`]/g, "'").split(/\s+/)) {
    let w = raw
      .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '')
      .replace(/^'+|'+$/g, '');
    if (!w) continue;
    if (/^\d+$/.test(w)) {
      out.push(...numberWords(Number(w)));
      continue;
    }
    w = CONTRACTIONS[w] ?? w;
    for (const [suffix, full] of SUFFIXES)
      if (w.endsWith(suffix) && w.length > suffix.length) {
        w = w.slice(0, -suffix.length) + full;
        break;
      }
    // "it's"/"he's" stay ambiguous (is/has): compare them as written.
    w = SAME[w] ?? w;
    out.push(...w.split(' ').filter(Boolean));
  }
  return out;
}

/** Edit distance between two words (letters). */
function letters(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return row[b.length];
}

/** Same word, allowing one-letter spelling variants of long words (colour/color). */
const matches = (a: string, b: string) =>
  a === b || (a.length >= 5 && b.length >= 5 && letters(a, b) <= 1);

/**
 * Strict score: every missed or wrong word costs 1.5 words' worth, every
 * extra word 0.75, so one slip in a ten-word sentence gives 85 and three give 55.
 */
export function shadowScore(
  targetWords: number,
  missedOrWrong: number,
  extra: number,
): number {
  if (!targetWords) return 0;
  const cost = (missedOrWrong * 1.5 + extra * 0.75) / targetWords;
  return Math.max(0, Math.round(100 * (1 - cost)));
}

/** Compare a transcript with the sentence, word by word. */
export function checkShadowing(sentence: string, heard: string): ShadowCheck {
  const display = sentence.split(/\s+/).filter(Boolean);
  // Each written word may expand to several tokens (don't → do not).
  const target: { token: string; word: number }[] = [];
  display.forEach((word, index) => {
    for (const token of shadowTokens(word)) target.push({ token, word: index });
  });
  const said = shadowTokens(heard);
  const n = target.length;
  const m = said.length;
  // Levenshtein alignment on tokens.
  const cost: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      cost[i][j] = Math.min(
        cost[i - 1][j - 1] +
          (matches(target[i - 1].token, said[j - 1]) ? 0 : 1),
        cost[i - 1][j] + 1,
        cost[i][j - 1] + 1,
      );
  const tokenStatus: { status: ShadowWordStatus; heard?: string }[] = new Array(
    n,
  );
  const extra: string[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      cost[i][j] ===
        cost[i - 1][j - 1] + (matches(target[i - 1].token, said[j - 1]) ? 0 : 1)
    ) {
      const ok = matches(target[i - 1].token, said[j - 1]);
      tokenStatus[i - 1] = ok
        ? { status: 'ok' }
        : { status: 'wrong', heard: said[j - 1] };
      i--;
      j--;
    } else if (i > 0 && cost[i][j] === cost[i - 1][j] + 1) {
      tokenStatus[i - 1] = { status: 'missed' };
      i--;
    } else {
      extra.unshift(said[j - 1]);
      j--;
    }
  }
  const words: ShadowWord[] = display.map((word) => ({ word, status: 'ok' }));
  target.forEach((t, k) => {
    const s = tokenStatus[k];
    const w = words[t.word];
    if (s.status === 'ok') return;
    if (s.status === 'wrong') {
      w.status = 'wrong';
      w.heard = w.heard ? `${w.heard} ${s.heard}` : s.heard;
    } else if (w.status === 'ok') w.status = 'missed';
  });
  const errors = tokenStatus.filter((s) => s.status !== 'ok').length;
  return { words, extra, heard, score: shadowScore(n, errors, extra.length) };
}

/**
 * Session score: the latest check of every sentence, averaged over all the
 * sentences of the dialogue. A sentence that was never recorded counts as 0.
 */
export function shadowSessionScore(
  sentenceCount: number,
  scores: readonly (number | undefined)[],
): number {
  if (!sentenceCount) return 0;
  let sum = 0;
  for (let i = 0; i < sentenceCount; i++) sum += scores[i] ?? 0;
  return Math.round(sum / sentenceCount);
}

export const createShadowingSessionSchema = z.object({
  title: z.string().check(z.trim(), z.minLength(1), z.maxLength(200)),
  score: z.number().check(z.int(), z.minimum(0), z.maximum(100)),
  sentences: z.number().check(z.int(), z.minimum(1), z.maximum(200)),
  attempted: z.number().check(z.int(), z.minimum(0), z.maximum(200)),
});
export type CreateShadowingSessionInput = z.infer<
  typeof createShadowingSessionSchema
>;

export interface ShadowingSession {
  id: string;
  title: string;
  score: number;
  sentences: number;
  attempted: number;
  createdAt: string;
}
