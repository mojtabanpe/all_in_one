import {
  asciiDigits,
  loadMessages,
  translateMessage,
  verbatim,
} from './localization';
import { MESSAGES } from './messages';
import { REVIEWED_MESSAGES } from './reviewed-messages';

describe('before the message table loads', () => {
  it('still fills Persian templates with their values', () => {
    expect(translateMessage('{0} از {1}', 'fa', [2, 5])).toBe('۲ از ۵');
  });
});

describe('application messages', () => {
  beforeAll(() => loadMessages());
  it('uses the chosen language regardless of the source language', () => {
    expect(translateMessage('خانه', 'en')).toBe('Home');
    expect(translateMessage('Home', 'fa')).toBe('خانه');
    expect(translateMessage('Poshtetgarm', 'fa')).toBe('Poshtetgarm');
    expect(translateMessage('Exercise', 'fa')).toBe('تمرین');
  });
  it('formats positional values and rendered dynamic copy without changing stored values', () => {
    expect(translateMessage('{0} از {1}', 'en', [2, 5])).toBe('2 of 5');
    expect(translateMessage('۲ روز پیاپی', 'en')).not.toMatch(
      /[\u0600-\u06ff]/,
    );
    expect(asciiDigits('۱۲٣۴')).toBe('1234');
    expect(translateMessage('My own task', 'en')).toBe('My own task');
  });
  it('keeps every translation’s positional placeholders intact', () => {
    for (const [fa, en] of [...MESSAGES, ...REVIEWED_MESSAGES]) {
      const slots = (s: string) =>
        [...new Set(s.match(/\{\d+\}/g) ?? [])].sort();
      expect(slots(fa), fa).toEqual(slots(en));
    }
  });
  it('uses reviewed complete sentences and preserves unknown user titles', () => {
    expect(translateMessage('عقب‌افتاده', 'en')).toBe('Overdue');
    expect(translateMessage('TRX کل بدن — هر روز ۳۰ دقیقه', 'en')).toBe(
      'Full-body TRX · 30 minutes daily',
    );
    expect(translateMessage('کل بدن A — سبک‌تر (روز هفتم)', 'en')).toBe(
      'Full body A — Lighter session (day 7)',
    );
    expect(translateMessage('اسکات با کش', 'en')).toBe('Resistance-band squat');
    expect(translateMessage('My own plan 30 دقیقه', 'en')).toBe(
      'My own plan 30 دقیقه',
    );
    expect(
      translateMessage('{0} از شروع، ساعت {1}', 'en', [
        '13 hours 31 minutes',
        '22:30',
      ]),
    ).toBe('13 hours 31 minutes elapsed · Started at 22:30');
  });
  it('translates workout rest and completion sentences with locale-specific numbers', () => {
    const rest = 'ست قبلی انجام شد؛ قبل از ادامه {0} ثانیه استراحت کن.';
    for (const seconds of [30, 45, 90]) {
      expect(translateMessage(rest, 'en', [seconds])).toBe(
        `Previous set completed. Rest for ${seconds} seconds before continuing.`,
      );
      expect(translateMessage(rest, 'fa', [seconds])).toBe(
        `ست قبلی انجام شد؛ قبل از ادامه ${seconds.toLocaleString('fa-IR')} ثانیه استراحت کن.`,
      );
    }
    const completed = '{0} ست را طبق برنامه انجام دادی.';
    expect(translateMessage(completed, 'en', [14])).toBe(
      'You completed 14 sets as planned.',
    );
    expect(translateMessage(completed, 'fa', [14])).toBe(
      '۱۴ ست را طبق برنامه انجام دادی.',
    );
  });
  it('never translates verbatim values', () => {
    expect(translateMessage('{0} از {1}', 'fa', [verbatim('home'), 3])).toBe(
      'home از ۳',
    );
    expect(translateMessage('خانه', 'en')).toBe('Home');
  });
});
