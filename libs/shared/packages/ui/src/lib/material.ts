/**
 * Quiet Workspace material for the spartan wrappers (design system, directive 18).
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

/** Matte fill uses the element's primary so each applet retains its accent. */
const GLOSS = 'bg-primary';

const BUTTON_VARIANT: Record<Variant, string> = {
  default: `${GLOSS} shadow-pillow-primary hover:shadow-pillow-primary-hover`,
  outline: 'border-border bg-card shadow-pillow-secondary hover:bg-secondary',
  secondary: 'shadow-pillow-secondary',
  ghost: '',
  destructive: 'hover:bg-destructive/15',
  link: '',
};

/** Consistent control geometry with mobile touch targets. */
const BUTTON_SIZE: Record<Size, string> = {
  default: 'h-11 px-4',
  xs: 'min-h-11 rounded-xl md:min-h-0',
  sm: 'min-h-11 rounded-xl px-3 md:min-h-0',
  lg: 'h-12 gap-2 px-5 text-base',
  icon: 'size-11',
  'icon-xs': 'min-h-11 min-w-11 rounded-xl md:min-h-0 md:min-w-0',
  'icon-sm': 'min-h-11 min-w-11 rounded-xl md:min-h-0 md:min-w-0',
  'icon-lg': 'size-12',
};

/** Calm controls with subtle depth and visible boundaries. */
export function buttonMaterial(button: HlmButton): void {
  classes(() => [
    'rounded-xl font-medium',
    BUTTON_VARIANT[button.variant() ?? 'default'],
    BUTTON_SIZE[button.size() ?? 'default'],
  ]);
}

/** Inset porcelain field, 44px tall. */
const FIELD =
  'h-11 border-input bg-card px-3.5 shadow-input focus-visible:shadow-none';

export function inputMaterial(_input: HlmInput): void {
  classes(() => FIELD);
}

export function textareaMaterial(_textarea: HlmTextarea): void {
  classes(
    () =>
      'border-input bg-card px-3.5 py-2.5 shadow-input focus-visible:shadow-none',
  );
}

export function inputGroupMaterial(_group: HlmInputGroup): void {
  classes(() => 'h-11 border-transparent bg-card shadow-input');
}

/** Porcelain glass card: soft surface shadow, white edge, 20px padding. */
export function cardMaterial(_card: HlmCard): void {
  classes(
    () =>
      'shadow-surface ring-border rounded-2xl [--card-spacing:--spacing(6)]',
  );
}

/** For `aio-native-select`, which passes it to spartan's `selectClass`. */
export const NATIVE_SELECT_MATERIAL =
  'h-11 border-input bg-card ps-3.5 shadow-input';
