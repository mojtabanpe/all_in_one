import { REVIEWED_MESSAGES } from './reviewed-messages';
import { MESSAGES } from './messages';

export type AppLanguage = 'fa' | 'en';
export const LANGUAGE_COOKIE = 'poshtetgarm_language';
export const isAppLanguage = (value: unknown): value is AppLanguage =>
  value === 'fa' || value === 'en';
export const asciiDigits = (value: string) =>
  value.replace(/[۰-۹٠-٩]/g, (digit) =>
    String(digit.charCodeAt(0) - (digit >= '۰' ? 1776 : 1632)),
  );
export const normalizeMessage = (value: string) =>
  asciiDigits(value).replace(/\s+/g, ' ').trim();
const digits = (value: string, language: AppLanguage) =>
  language === 'en'
    ? asciiDigits(value)
    : value.replace(/\d/g, (n) => '۰۱۲۳۴۵۶۷۸۹'[Number(n)]);
const exact = new Map<string, readonly [string, string]>();
const patterns: {
  match: RegExp;
  pair: readonly [string, string];
  slots: number[];
  numericOnly: boolean;
}[] = [];
const special = new Set([
  '.',
  '*',
  '+',
  '?',
  '^',
  '$',
  '{',
  '}',
  '(',
  ')',
  '|',
  '[',
  ']',
  String.fromCharCode(92),
]);
const escapeRegex = (value: string) =>
  [...value]
    .map((char) => (special.has(char) ? String.fromCharCode(92) + char : char))
    .join('');
for (const pair of [...MESSAGES, ...REVIEWED_MESSAGES]) {
  for (const source of pair) exact.set(normalizeMessage(source), pair);
}
const numericUnits = new Set([
  'دقیقه',
  'ساعت',
  'کیلوگرم',
  'کالری',
  'روز',
  'minute',
  'minutes',
  'hour',
  'hours',
  'day',
  'days',
  'calories',
  'kg',
]);
for (const [key, pair] of exact) {
  if (!/\{\d+\}/.test(key)) continue;
  const slots: number[] = [];
  let last = 0,
    pattern = '^';
  for (const part of key.matchAll(/\{(\d+)\}/g)) {
    pattern += escapeRegex(key.slice(last, part.index)) + '(.+?)';
    slots.push(Number(part[1]));
    last = part.index! + part[0].length;
  }
  pattern += escapeRegex(key.slice(last)) + '$';
  if (!key.replace(/\{\d+\}/g, '').trim()) continue;
  patterns.push({
    match: new RegExp(pattern),
    pair,
    slots,
    numericOnly:
      slots.length === 1 &&
      key.startsWith('{0}') &&
      numericUnits.has(key.slice(3).trim()),
  });
}
patterns.sort((a, b) => b.match.source.length - a.match.source.length);
const cache = new Map<string, string>();

/** Translate interface copy; callers leave user-entered and learning content outside this function. */
export function translateMessage(
  source: string | number | null | undefined,
  language: AppLanguage,
  values: readonly unknown[] = [],
): string {
  if (source === null || source === undefined) return '';
  if (source === 'Poshtetgarm') return source;
  if (typeof source === 'number')
    return source.toLocaleString(language === 'en' ? 'en-US' : 'fa-IR');
  if (!/[\p{L}]/u.test(source))
    return language === 'en'
      ? asciiDigits(source)
          .replace(/،/g, ',')
          .replace(/؛/g, ';')
          .replace(/؟/g, '?')
      : digits(source, language);
  const key = normalizeMessage(source);
  const cachedKey = language + ':' + key;
  if (!values.length && cache.has(cachedKey)) return cache.get(cachedKey)!;
  let pair = exact.get(key);
  let args = values;
  if (!pair) {
    for (const candidate of patterns) {
      const match = candidate.match.exec(key);
      if (!match) continue;
      if (
        candidate.numericOnly &&
        !Number.isFinite(
          Number(asciiDigits(match[1]).replace(/[٬,]/g, '').replace('٫', '.')),
        )
      )
        continue;
      pair = candidate.pair;
      const captured: unknown[] = [];
      candidate.slots.forEach(
        (slot, index) => (captured[slot] = match[index + 1]),
      );
      args = captured;
      break;
    }
  }
  let result = pair
    ? pair[language === 'fa' ? 0 : 1].replace(
        /\{(\d+)\}/g,
        (placeholder, index) => {
          const value = args[Number(index)];
          if (value === undefined || value === null)
            return value === undefined ? placeholder : '';
          if (typeof value === 'number')
            return value.toLocaleString(language === 'en' ? 'en-US' : 'fa-IR');
          const text = String(value);
          if (text === 'Poshtetgarm') return text;
          const translated = /[\p{L}]/u.test(text)
            ? exact.get(normalizeMessage(text))
            : undefined;
          return translated
            ? translated[language === 'fa' ? 0 : 1]
            : digits(
                text
                  .split(/([،؛])/)
                  .map((part) => {
                    const match = /[\p{L}]/u.test(part)
                      ? exact.get(normalizeMessage(part))
                      : undefined;
                    return match
                      ? part.replace(
                          part.trim(),
                          match[language === 'fa' ? 0 : 1],
                        )
                      : part;
                  })
                  .join(''),
                language,
              );
        },
      )
    : digits(source, language);
  if (language === 'en')
    result = asciiDigits(result)
      .replace(/،/g, ',')
      .replace(/؛/g, ';')
      .replace(/؟/g, '?');
  if (!values.length) {
    if (cache.size > 4000) cache.clear();
    cache.set(cachedKey, result);
  }
  return result;
}
