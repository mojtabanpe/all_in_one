import { asciiDigits } from '@all-in-one/localization';

export type Lang = 'fa' | 'en';

/** A number in the account's digits: Persian digits in Persian, Latin in English. */
export const num = (language: Lang, value: number) =>
  value.toLocaleString(language === 'en' ? 'en-US' : 'fa-IR', {
    maximumFractionDigits: 1,
  });

/** A Tehran calendar day (YYYY-MM-DD) in the account's calendar (directive 101): Solar Hijri or Gregorian. */
export function formatDay(language: Lang, iso: string): string {
  return new Intl.DateTimeFormat(
    language === 'en' ? 'en-US' : 'fa-IR-u-ca-persian',
    { day: 'numeric', month: 'long', timeZone: 'UTC' },
  ).format(new Date(`${iso}T12:00:00Z`));
}

/** Tehran time of an instant, HH:mm in the account's digits. */
export function formatTime(language: Lang, instant: string | Date): string {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tehran',
  }).format(new Date(instant));
}

/** «۵ ساعت و ۱۰ دقیقه» / «5 h 10 min». */
export function formatHours(language: Lang, hours: number): string {
  const whole = Math.floor(hours);
  const minutes = Math.floor((hours - whole) * 60);
  return language === 'en'
    ? `${whole} h ${minutes} min`
    : `${num('fa', whole)} ساعت و ${num('fa', minutes)} دقیقه`;
}

/** Telegram text is plain: drop the assistant's markdown bold and headings. */
export function plainReply(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

/** Latin digits and a dot for the decimal separator, from Persian or Arabic input. */
const normalizeNumbers = (text: string) =>
  asciiDigits(text)
    .replace(/[٫/]/g, '.')
    .replace(/[٬،,](?=\d{3})/g, '');

/** Numbers in a message («۸۵٫۵» → 85.5), in order. */
export function numbersIn(text: string): number[] {
  return (normalizeNumbers(text).match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

const MULTIPLIERS: [RegExp, number][] = [
  [/^(?:میلیون|ملیون|million|m)(?![\p{L}])/iu, 1_000_000],
  [/^(?:هزار|thousand|k)(?![\p{L}])/iu, 1_000],
];

/**
 * One expense per line: a title and an amount in Toman, e.g. «نان ۵۰٬۰۰۰», «تاکسی ۸۰ هزار», «coffee 120k».
 * Null when a line has no title or no amount, so the caller can ask the assistant instead.
 */
export function parseExpenseLines(
  text: string,
): { title: string; amount: number }[] | null {
  const lines = text
    .split(/\n|؛|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length || lines.length > 30) return null;
  const items: { title: string; amount: number }[] = [];
  for (const raw of lines) {
    const line = normalizeNumbers(raw);
    const matches = [...line.matchAll(/(\d+(?:\.\d+)?)\s*/g)];
    const last = matches.at(-1);
    if (!last || last.index === undefined) return null;
    let amount = Number(last[1]);
    let end = last.index + last[0].length;
    const after = line.slice(end);
    const rest = after.replace(/^\s+/, '');
    for (const [pattern, factor] of MULTIPLIERS) {
      const word = pattern.exec(rest);
      if (word) {
        amount *= factor;
        end += after.length - rest.length + word[0].length;
        break;
      }
    }
    const title = (line.slice(0, last.index) + ' ' + line.slice(end))
      .replace(/(?:تومان|تومن|toman|tomans)/giu, ' ')
      .replace(/[:：\-–—=]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    amount = Math.round(amount);
    if (!title || !Number.isSafeInteger(amount) || amount < 1) return null;
    items.push({ title: title.slice(0, 160), amount });
  }
  return items;
}

/** Long text in Telegram-sized pieces (≤ `size`), split at paragraph or sentence ends. */
export function chunks(text: string, size = 3500): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > size) {
    const slice = rest.slice(0, size);
    const cut = Math.max(
      slice.lastIndexOf('\n\n'),
      slice.lastIndexOf('\n'),
      slice.lastIndexOf('. '),
    );
    const at = cut > size / 2 ? cut + 1 : size;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}
