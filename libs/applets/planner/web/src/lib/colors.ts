import type { PlannerColor } from '@all-in-one/applets/planner/contracts';

/** Colour classes per planner colour (literal so Tailwind finds them). */
export const TONE: Record<
  PlannerColor,
  { dot: string; soft: string; text: string; ring: string }
> = {
  sky: {
    dot: 'bg-sky-500',
    soft: 'bg-sky-500/12',
    text: 'text-sky-700',
    ring: 'ring-sky-500',
  },
  violet: {
    dot: 'bg-violet-500',
    soft: 'bg-violet-500/12',
    text: 'text-violet-700',
    ring: 'ring-violet-500',
  },
  rose: {
    dot: 'bg-rose-500',
    soft: 'bg-rose-500/12',
    text: 'text-rose-700',
    ring: 'ring-rose-500',
  },
  amber: {
    dot: 'bg-amber-500',
    soft: 'bg-amber-500/14',
    text: 'text-amber-800',
    ring: 'ring-amber-500',
  },
  sage: {
    dot: 'bg-emerald-600',
    soft: 'bg-emerald-600/12',
    text: 'text-emerald-700',
    ring: 'ring-emerald-600',
  },
  clay: {
    dot: 'bg-orange-700',
    soft: 'bg-orange-700/12',
    text: 'text-orange-800',
    ring: 'ring-orange-700',
  },
  slate: {
    dot: 'bg-slate-500',
    soft: 'bg-slate-500/12',
    text: 'text-slate-700',
    ring: 'ring-slate-500',
  },
};

export const COLOR_LABELS: Record<PlannerColor, string> = {
  sky: 'آبی',
  violet: 'بنفش',
  rose: 'سرخ',
  amber: 'کهربایی',
  sage: 'سبز',
  clay: 'نارنجی',
  slate: 'خاکستری',
};
