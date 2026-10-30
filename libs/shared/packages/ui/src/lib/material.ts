/**
 * Skeuo Next material for the spartan wrappers (design system, directive 18).
 *
 * spartan Helm code stays untouched: each `*Material(hlm)` function runs in
 * the constructor of the generated `Aio*` wrapper (tools/scripts/generate-ui-wrappers.mjs
 * wires every function here by its parameter type) and registers an extra
 * class source with spartan's `classes()`. Sources registered later win in the
 * tailwind-merge, so these classes override Helm's, and classes written in a
 * template still override both.
 *
 * Keep class strings literal so Tailwind finds them.
 */
import type { HlmButton } from '@spartan-ng/helm/button';
import type { HlmCard } from '@spartan-ng/helm/card';
import type { HlmInput } from '@spartan-ng/helm/input';
import type { HlmInputGroup } from '@spartan-ng/helm/input-group';
import type { HlmTextarea } from '@spartan-ng/helm/textarea';
import { classes } from '@spartan-ng/helm/utils';

type Variant = NonNullable<ReturnType<HlmButton['variant']>>;
type Size = NonNullable<ReturnType<HlmButton['size']>>;

/** Glossy fill built from the element's own --primary, so applet accents apply. */
const GLOSS =
  'bg-[linear-gradient(180deg,color-mix(in_oklch,var(--primary)_78%,white)_0%,var(--primary)_48%,color-mix(in_oklch,var(--primary)_88%,black)_100%)]';

const BUTTON_VARIANT: Record<Variant, string> = {
  default: `${GLOSS} shadow-pillow-primary hover:shadow-pillow-primary-hover`,
  outline:
    'border-transparent bg-card shadow-pillow-secondary hover:bg-card hover:shadow-pillow-secondary-hover',
  secondary: 'shadow-pillow-secondary',
  ghost: '',
  destructive: 'hover:bg-destructive/15',
  link: '',
};

/** Pills everywhere; default and large sizes grow toward 44px touch targets. */
const BUTTON_SIZE: Record<Size, string> = {
  default: 'h-11 px-4',
  xs: 'min-h-11 rounded-full md:min-h-0',
  sm: 'min-h-11 rounded-full px-3 md:min-h-0',
  lg: 'h-12 gap-2 px-5 text-base',
  icon: 'size-11',
  'icon-xs': 'min-h-11 min-w-11 rounded-full md:min-h-0 md:min-w-0',
  'icon-sm': 'min-h-11 min-w-11 rounded-full md:min-h-0 md:min-w-0',
  'icon-lg': 'size-12',
};

/** Pill buttons with "pillow" shadows; the primary fill is glossy. */
export function buttonMaterial(button: HlmButton): void {
  classes(() => [
    'rounded-full',
    BUTTON_VARIANT[button.variant() ?? 'default'],
    BUTTON_SIZE[button.size() ?? 'default'],
  ]);
}

/** Inset porcelain field, 44px tall. */
const FIELD =
  'h-11 border-transparent bg-card px-3.5 shadow-input focus-visible:shadow-none';

export function inputMaterial(_input: HlmInput): void {
  classes(() => FIELD);
}

export function textareaMaterial(_textarea: HlmTextarea): void {
  classes(
    () =>
      'border-transparent bg-card px-3.5 py-2.5 shadow-input focus-visible:shadow-none',
  );
}

export function inputGroupMaterial(_group: HlmInputGroup): void {
  classes(() => 'h-11 border-transparent bg-card shadow-input');
}

/** Porcelain glass card: soft surface shadow, white edge, 20px padding. */
export function cardMaterial(_card: HlmCard): void {
  classes(() => 'shadow-surface ring-white/80 [--card-spacing:--spacing(5)]');
}

/** For `aio-native-select`, which passes it to spartan's `selectClass`. */
export const NATIVE_SELECT_MATERIAL =
  'h-11 border-transparent bg-card ps-3.5 shadow-input';
