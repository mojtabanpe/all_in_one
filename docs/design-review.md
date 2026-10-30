# Design review — 2026-10-30

Reviewed the existing Skeuo Next / glass / Persian RTL design without replacing
its palette or components. Better Design MCP was unavailable; no online Better
Design review is claimed.

Changes:

- Fitness now opens with weekly activity instead of a long routine form.
- Routine creation opens in the existing responsive dialog/bottom-sheet wrapper.
- Exercise discovery initially shows six movements, with progressive disclosure.
- Shared wrapper buttons use 44px default targets and mobile minimums for small
  sizes. Fitness category filters also have 44px targets.

Browser checks used the production customer build and mocked API responses for
layout inspection (not a live authenticated backend). Inspected home, fitness
and nutrition at 375px, fitness at 1440px, and routine-sheet opening with reduced
motion. No horizontal document overflow was observed at those widths. In the
checked mobile pages the previously observed 32/36px buttons were corrected.
Screenshots were inspected. Populated account flows, other applets and all
possible content lengths were not exhaustively reviewed.

Validation: all 60 Nx lint/test/build/typecheck tasks passed on the final run
(58 from cache). An earlier concurrent run exhausted memory; rerunning serially
succeeded. Existing warnings include bundle-size budgets and jsdom CSS parsing.
