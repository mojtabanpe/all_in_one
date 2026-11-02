type Language = 'fa' | 'en';
const number = (n: number, language: Language, two = false) =>
  n.toLocaleString(language === 'en' ? 'en-US' : 'fa-IR', {
    useGrouping: false,
    minimumIntegerDigits: two ? 2 : 1,
  });

/** A running clock. Digit shaping follows the interface; punctuation stays isolated in the view. */
export function timer(hours: number, language: Language = 'fa'): string {
  const minutes = Math.max(0, Math.floor(hours * 60));
  return `${number(Math.floor(minutes / 60), language)}:${number(minutes % 60, language, true)}`;
}

/** Format the full duration in one language instead of translating individual words. */
export function duration(hours: number, language: Language = 'fa'): string {
  const minutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(minutes / 60),
    m = minutes % 60;
  if (language === 'en') {
    const parts: string[] = [];
    if (h) parts.push(`${number(h, language)} ${h === 1 ? 'hour' : 'hours'}`);
    if (m || !h)
      parts.push(`${number(m, language)} ${m === 1 ? 'minute' : 'minutes'}`);
    return parts.join(' ');
  }
  if (!h) return `${number(m, language)} دقیقه`;
  return m
    ? `${number(h, language)} ساعت و ${number(m, language)} دقیقه`
    : `${number(h, language)} ساعت`;
}

/** Tehran time, matching the app's calendar and reminders. */
export function clockTime(iso: string, language: Language = 'fa'): string {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'fa-IR', {
    timeZone: 'Asia/Tehran',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** A Date as a `datetime-local` input value (local time, minutes). */
export function toLocalInput(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}
export function fromLocalInput(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
