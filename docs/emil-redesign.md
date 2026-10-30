# Quiet Workspace redesign

The owner rejected the previous UI and requested `emilkowalski/skills`.
Installed the collection with `npx skills@latest add emilkowalski/skills` and
applied `emil-design-eng` and `animate` (including the button recipe).
The installer stores the skills in the git-ignored `.agents/skills` directory;
`skills-lock.json` records their source hashes. No third-party UI runtime was added.

| Before                                      | After                                                                | Why                                            |
| ------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| Glossy pill controls and deep shadows       | Matte 12px controls, quiet borders and shallow depth                 | Let content carry hierarchy                    |
| Four isolated dashboard rows                | Daily hero with real metrics, module shortcuts and actual next tasks | Make a useful starting point                   |
| Full-width stacked health panels on desktop | Responsive two-column panels                                         | Use available space deliberately               |
| Identical page chrome                       | Distinct applet headings and calm segmented navigation               | Clarify location and purpose                   |
| Undirected motion                           | 140ms press feedback and 160ms fine-pointer hover                    | Immediate response without delaying navigation |

The redesign affects the shared wrappers/theme (customer, public and admin),
workspace shell, mobile navigation, customer dashboard, public landing page,
applet headings and health layouts. Functional API/data contracts are preserved.
The product remains Persian RTL with mobile drawers and Spartan primitives.

Only transform/color properties animate for the new feedback. Hover movement is
fine-pointer gated; keyboard focus does not scale controls. Reduced-motion users
get no transform-based feedback. No page-entry animation delays frequent navigation.
No animation library was installed.

New text/background contrast ratios: body 13.75, muted 5.24, primary 9.58,
hero secondary 8.11 and hero action 9.91 (WCAG relative-luminance calculation).
See `design-system/all-in-one/MASTER.md` for the current palette and specification.

Browser layout reviews use production builds with explicitly mocked account and
applet API data. They are UI checks, not backend integration tests. Physical-device
gesture feel still needs a real-device check. Screenshots are generated outside
source in `/workspace/scratch/emil-review`.

## Final verification

- All 60 Nx lint/test/build/typecheck tasks passed on the final source.
- 24 browser layouts: home, planner, English, fitness, nutrition and public landing
  at widths 320, 390, 768 and 1440, with no horizontal document overflow or JS errors.
- Routine-creation overlays opened under reduced motion at all four widths.
- The final shared font is the official full Vazirmatn Variable, self-hosted as
  a 109 KiB WOFF2 with its OFL license. The `ss01` feature was verified by identical
  browser screenshots of ASCII `0123456789` and Persian `۰۱۲۳۴۵۶۷۸۹`.
- Screenshots use mocked data; real-device gestures and all populated account
  flows were not exhaustively tested. No production deployment was performed.
