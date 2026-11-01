# All in One — Quiet Workspace (2026-10-30)

The owner explicitly replaced the earlier Skeuo Next direction with a redesign
using Emil Kowalski's `emil-design-eng` and `animate` skills. The previous
specification below is historical where it conflicts with this section.

## Current system

- Background `#f5f7f7`; foreground `#172b2d`; secondary text `#586b6b`.
- White translucent surfaces, `#dce5e3` borders, restrained low-opacity shadows.
- Primary `#174d48` with white text; accent `#e3efeb` with primary text.
- Editorial hero `#173c38` with white and secondary `#c1d9d1` text.
- Hero action `#d9f0c7` with `#173c38` text. These pairs are checked in the browser.
- Existing blue/green/orange applet accents remain distinct within each applet.
- Self-hosted Vazirmatn Variable (100–900), `ss01` Persian digits, larger confident page titles, 14–16px body, 12px captions.
- Surface radius 16–24px, control radius 12px. Default controls are at least 44px.
- No glossy gradients or deep pillow shadows. Glass is subtle and supports hierarchy.
- Sidebar navigation is calm and spacious; the mobile bottom navigation remains floating.
- Dashboard: personal greeting, one clear hero action, live summaries, four module
  shortcuts, and actual next tasks. Unknown/error states never masquerade as zero
  in the hero. No fabricated achievement metrics or decorative charts.
- Motion is for press feedback (140ms, scale .97) and pointer hover feedback
  (160ms, 2px lift), not waiting for navigation. Named transform/color transitions,
  fine-pointer gating, visible keyboard focus and reduced-motion alternatives.
- Keep all primitives in existing Spartan wrappers; never edit generated Helm code.

| Before                                  | After                                     | Why                                      |
| --------------------------------------- | ----------------------------------------- | ---------------------------------------- |
| Equally prominent pill cards everywhere | Quiet chrome plus one dominant daily hero | Establish a starting point               |
| Glossy buttons and deep shadows         | Matte controls and subtle borders         | Improve density and clarity              |
| Four isolated summary rows              | A composed workspace with next tasks      | Make the dashboard useful                |
| Uncontrolled press/hover motion         | Brief named-property transitions          | Immediate feedback with less distraction |

---

## Health companion override

The health applet uses a scoped `.health-calm` theme inspired by the owner's
Gordool screenshots. Other applets retain the workspace theme above.

- White cards with 30px corners; primary text/actions `#232326`, muted text
  `#72727a`, borders `#e7e7ec`, and soft controls `#f0f0f4`.
- Asymmetric daily calorie tiles, a seven-day selector, grouped profile settings,
  approachable workout cards and meal details using the existing dialog wrapper.
- Values come from saved records and plans. Missing macros remain unknown.
  Opening a planned meal never logs it; recording requires the meal form.
- The apricot companion is an original generated illustration, bundled locally
  as `health-companion.webp`; it is decorative and carries no health data.
- Preserve RTL, Persian digit glyphs, keyboard focus and reduced-motion behavior.

## Historical specification

# All in One — Design System (MASTER)

Source of truth for visual decisions. Tokens: `libs/shared/packages/ui/src/styles/theme.css`.
Material (button, input, card classes): the wrappers, `libs/shared/packages/ui/src/lib/material.ts`
(spartan Helm code stays untouched, directive 19).
Living style guide: admin app → **طراحی** (`/design`), rendered from the real tokens and wrappers.

## Basis

- **Base system:** Better Design **Skeuo Next** (owner's choice, 2026-10-30). It's light-only, with cool
  porcelain glass, glossy graphite pill buttons, an aqua accent, a 22px squircle radius and layered
  "pillow" shadows. Preview: https://better-design.com/design-systems/skeuo-next
- **Adaptations for this product:**
  - Glassmorphism (directive 5): cards and sheets are translucent porcelain (`--card` at 78%, `--glass`
    at 72%) with a 20px backdrop blur over soft aqua/lilac/mint ambient light.
  - Persian RTL (directive 12): **Inter Variable** draws Latin text (as in Skeuo Next) and
    **Vazirmatn Variable** draws Persian; both are self-hosted through `@fontsource-variable`.
  - Applet accents (directive 17) replace graphite as `--primary` inside each applet.
  - Contrast: several Skeuo values were darkened to pass WCAG AA (see "Contrast" below).
- Light theme only; there is no dark mode.

## Palette

All values are OKLCH. "On" is the text colour used on that fill.

### Neutrals (cool porcelain)

| Token                | Value                    | Use                                    |
| -------------------- | ------------------------ | -------------------------------------- |
| `--background`       | `0.965 0.006 240`        | page                                   |
| `--card`             | `0.995 0.003 240 / 0.78` | glass cards, lists                     |
| `--popover`          | `0.995 0.003 240 / 0.92` | popovers, sheets                       |
| `--secondary`        | `0.93 0.008 240`         | soft buttons, chips                    |
| `--muted`            | `0.93 0.008 240`         | wells, empty tracks                    |
| `--muted-foreground` | `0.49 0.02 255`          | secondary text (5.0:1 on bg and muted) |
| `--border`           | `0.9 0.008 245`          | dividers                               |
| `--input`            | `0.88 0.01 245`          | control outlines                       |
| `--foreground`       | `0.19 0.02 265`          | text (16.7:1)                          |

### Brand

| Token       | Value            | On                        | Use                                      |
| ----------- | ---------------- | ------------------------- | ---------------------------------------- |
| `--primary` | `0.24 0.025 265` | `0.98 0.004 240` (15.6:1) | glossy graphite: main buttons, shell     |
| `--accent`  | `0.93 0.045 200` | `0.46 0.1 205` (5.4:1)    | aqua tint: selected nav item, highlights |
| `--ring`    | `0.62 0.13 205`  | n/a                       | focus ring (3:1 against the background)  |

### Status

| Token           | Value           | On             | Contrast |
| --------------- | --------------- | -------------- | -------- |
| `--success`     | `0.52 0.13 160` | white          | 5.1:1    |
| `--warning`     | `0.8 0.15 80`   | `--foreground` | 9.7:1    |
| `--destructive` | `0.56 0.2 22`   | white          | 5.2:1    |
| `--info`        | `0.52 0.11 215` | white          | 5.2:1    |

Status colours always come with a label or an icon, never colour alone.

### Applet accents

| Token       | Value           | Applet / meaning        | White text | As text on bg                |
| ----------- | --------------- | ----------------------- | ---------- | ---------------------------- |
| `--planner` | `0.54 0.19 258` | planner (TickTick blue) | 5.2:1      | 4.7:1                        |
| `--english` | `0.52 0.2 293`  | english (violet)        | 6.0:1      | 5.6:1                        |
| `--health`  | `0.53 0.15 152` | health (green)          | 4.9:1      | 4.5:1                        |
| `--streak`  | `0.56 0.14 62`  | streak flame (amber)    | 4.8:1      | 4.4:1 (bold/large text only) |
| `--gem`     | `0.54 0.14 235` | learned words / gems    | 4.8:1      | 4.3:1 (bold/large text only) |

English and health pages sit on `.lx-stage` (ambient light from the applet's `--lx-1..4`) with glass panels
(`.lx-glass`; health's companion cards get the same material through `.health-calm`). 2026-11-01.

The applet root carries `.applet-planner` / `.applet-english` / `.applet-health`, which sets `--primary`,
`--ring` and `--accent`, so every spartan component inside follows the applet colour. Sheets and dialogs
are portalled, so they take the same class through `aio-dialog contentClass`.

## Typography

- Families: `'Inter Variable'` (Latin), `'Vazirmatn Variable'` (Persian).
- Scale (about 3 sizes per view, steps of 25% or more):

| Role       | Class                 | Size    |
| ---------- | --------------------- | ------- |
| Key number | `text-3xl`/`4xl` bold | 30–36px |
| Page title | `text-2xl` bold       | 24px    |
| Section    | `text-lg` bold        | 18px    |
| Body       | `text-base`           | 16px    |
| Secondary  | `text-sm` muted       | 14px    |
| Caption    | `text-xs`             | 12px    |

- Bold is reserved for key numbers, titles and active values. Persian digits come from `faNumber`, and
  the Persian comma `،` is the separator (never `·`, which reads as ۰).

## Shape, depth, motion

- Radius: `--radius` 22px; `sm` 14, `md` 18 (inputs), `lg` 22, `xl`/`2xl` 28 (cards, lists), `full` (buttons).
- Buttons are pills. The default variant has a glossy gradient of `--primary` and `shadow-pillow-primary`;
  outline and secondary are porcelain with `shadow-pillow-secondary`. English uses `btn-3d` (flat Duolingo
  fill with a solid bottom edge).
- Inputs: porcelain fill with an inset `shadow-input`, 44px tall, and a ring on focus.
- Surfaces: `shadow-surface` (inner top highlight and a soft drop) plus a white 1px edge.
- Motion: 150ms with `cubic-bezier(0.165, 0.84, 0.44, 1)`; respect `prefers-reduced-motion`.

## Spacing and layout

- Scale 4/8/12/16/24/32px; page sections `gap-6`, inside cards `gap-3`/`gap-4`, card padding 20px.
- Touch targets are at least 44px; small checkboxes get an invisible hit area.
- Phones (`< 768px`): floating glass bottom nav (approved `aio-bottom-nav`), with the active item in an
  aqua tint. Tablet/desktop: the spartan sidebar on the start (right) side, floating and collapsible.
- Content max width 5xl; single-column applets (English) cap at `max-w-xl`, the planner at `max-w-2xl`.

## Overlays and feedback

- Dialogs, alerts and confirmations use `aio-dialog` / `AioConfirm`: a bottom drawer on phones, a dialog elsewhere.
- Short toasts: `aioToast` (spartan sonner), bottom-center, above the bottom nav.

## Accessibility

- Text at least 4.5:1, focus ring and icons at least 3:1 (values above).
- `prefers-reduced-transparency` switches to solid porcelain and drops the blur.
- Icon-only buttons need an `aria-label`; colour never carries meaning alone.

## Applet references (directive 17)

- planner → TickTick; english → Duolingo; health → Gordool. See CLAUDE.md for the patterns.
