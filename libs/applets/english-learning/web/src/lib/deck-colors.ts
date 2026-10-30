import type { DeckColor } from '@all-in-one/applets/english-learning/contracts';

/** Deck tone classes (literal so Tailwind finds them). */
export const DECK_TONE: Record<DeckColor, { bar: string; soft: string; text: string }> = {
  amber: { bar: 'bg-amber-500', soft: 'bg-amber-500/12', text: 'text-amber-700' },
  rose: { bar: 'bg-rose-500', soft: 'bg-rose-500/12', text: 'text-rose-700' },
  sage: { bar: 'bg-emerald-600', soft: 'bg-emerald-600/12', text: 'text-emerald-700' },
  sky: { bar: 'bg-sky-500', soft: 'bg-sky-500/12', text: 'text-sky-700' },
  violet: { bar: 'bg-violet-500', soft: 'bg-violet-500/12', text: 'text-violet-700' },
  clay: { bar: 'bg-orange-700', soft: 'bg-orange-700/12', text: 'text-orange-800' },
};
