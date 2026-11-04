import { readFileSync } from 'node:fs';
import { FITNESS_MESSAGES } from './fitness-messages';
import {
  loadMessages,
  normalizeMessage,
  translateMessage,
} from './localization';

// Read catalog copy without importing API modules into the shared browser library.
// This also catches newly seeded text that has no reviewed English translation.
const catalogFiles = [
  'exercise-catalog.ts',
  'trx-catalog.ts',
  'seed-fitness.ts',
];
const catalogCopy = catalogFiles.flatMap((file) => {
  const source = readFileSync(
    new URL(
      `../../../../../applets/health/api/src/lib/${file}`,
      import.meta.url,
    ),
    'utf8',
  );
  return [...source.matchAll(/'([^'\n]*[\u0600-\u06ff][^'\n]*)'/g)].map(
    (match) => match[1],
  );
});

describe('database-backed fitness display copy', () => {
  beforeAll(() => loadMessages());

  it('has reviewed translations for every seeded exercise and workout-program text', () => {
    const reviewed = new Set(
      FITNESS_MESSAGES.map(([fa]) => normalizeMessage(fa)),
    );
    const missing = [...new Set(catalogCopy)].filter(
      (copy) => !reviewed.has(normalizeMessage(copy)),
    );
    expect(missing).toEqual([]);
  });

  it('switches catalog copy to English and back without changing stored Persian', () => {
    for (const stored of catalogCopy) {
      const english = translateMessage(stored, 'en');
      expect(english, stored).not.toMatch(/[\u0600-\u06ff]/);
      expect(translateMessage(stored, 'fa'), stored).toBe(stored);
      // Switching languages must not retain a cached translation from the last choice.
      expect(translateMessage(stored, 'en'), stored).toBe(english);
    }
  });

  it('uses exercise terminology rather than literal machine translations', () => {
    expect(translateMessage('باسن عقب و پایین؛ کف پا ثابت.', 'en')).toBe(
      'Move your hips back and down, keeping your feet planted.',
    );
    expect(translateMessage('مقاومت در برابر چرخش تنه TRX', 'en')).toBe(
      'TRX anti-rotation press',
    );
    expect(translateMessage('کشش جلوی ران زانوزده TRX', 'en')).toBe(
      'TRX kneeling quadriceps stretch',
    );
  });

  it('translates complete image descriptions and their exercise names', () => {
    expect(translateMessage('مراحل اجرای {0}', 'en', ['اسکات جام دمبل'])).toBe(
      'Exercise steps: Dumbbell goblet squat',
    );
    expect(translateMessage('روش اجرای {0}', 'en', ['پرس پا دستگاه'])).toBe(
      'How to perform Machine leg press',
    );
  });

  it('preserves unknown user titles and stable slugs', () => {
    for (const value of [
      'برنامهٔ شخصی من برای جمعه',
      'My own strength plan',
      'trx-torso-rotation',
    ]) {
      expect(translateMessage(value, 'en')).toBe(value);
      expect(translateMessage(value, 'fa')).toBe(value);
    }
  });
});
