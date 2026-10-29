# All in One — Design System (MASTER)

Global source of truth for visual decisions (ui-ux-pro-max "Master + Overrides" pattern).
Page-specific overrides go in `design-system/all-in-one/pages/<page>.md`.
Tokens live in `libs/shared/packages/ui/src/styles/theme.css`.

## Direction

- **Style:** Glassmorphism (owner directive 5): translucent surfaces (white 55% light / 42% dark),
  `backdrop-filter: blur(18px) saturate(160%)`, 1px light border, soft violet shadow, vibrant
  ambient blobs behind (violet, green, pink) so the glass reads.
- **Language:** Persian, RTL (`<html lang="fa" dir="rtl">`), font **Vazirmatn Variable** (self-hosted).
- **Palette:** wellness — lavender violet primary `oklch(0.52 0.22 292)` (white text ≥ 4.5:1),
  wellness green `success`, warm `warning`, red `destructive`. Dark mode via `:root.dark`.
- **Radius:** 1rem base (cards ~1.4rem, bottom nav 1.75rem).

## Layout

- Phones (`< 768px`): floating glass **bottom nav** (approved custom `aio-bottom-nav`), content padded by
  `--bottom-nav-space`; safe-area insets respected.
- Tablet/desktop: spartan **sidebar** on the start (right) side, `floating`, collapsible to icons.
- Max content width 5xl; page gutters 16px phone / 24px desktop.

## Overlays & feedback

- Dialogs, alerts, confirmations: `aio-dialog` / `AioConfirm` → bottom **drawer** on phones, dialog elsewhere.
- Short toasts: `aioToast` (spartan sonner), bottom-center, above the bottom nav.

## Accessibility

- Text contrast ≥ 4.5:1 on glass; overlays use the stronger `--glass-strong` surface.
- `prefers-reduced-transparency: reduce` → solid surfaces, no blur.
- Touch targets ≥ 48px on phones (bottom nav items `min-h-12`), ≥ 8px apart.
- Active nav items carry `aria-current="page"`.

## Anti-patterns

- Raw colors (`bg-violet-500`); use semantic tokens (`bg-primary`, `text-muted-foreground`).
- Modals on phones; custom components without owner approval; importing spartan outside the wrapper libs.
