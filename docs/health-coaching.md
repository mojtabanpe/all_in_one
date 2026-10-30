# Independent health coaching

All catalog data, routines, session logs and meal plans live in this app. No YMove,
wger, Hevy, USDA or Spoonacular account, API key, SDK or network call is used.
The Persian exercise descriptions are original project content.

## Fitness

The catalog starts with 36 exercises, including bodyweight, TRX, dumbbell,
barbell, cable, machine and resistance-band movements. Each has a primary
muscle, secondary muscles, level, execution steps, mistakes and alternatives.
`videoUrl` is optional. Admins can set or clear an HTTPS link through
`PATCH /api/health/exercises/:slug/video`; reseeding preserves added videos.

The fitness page generates and saves a template from equipment, level, goal,
2–6 sessions/week, 1–12 weeks and 20–90 minutes/session. It includes warmup,
cooldown and progression guidance. Users can edit exercises, sets, repetitions,
timed holds and rest. Weeks specify the program horizon; the app does not yet
schedule calendar dates or automatically increase load. Templates do not adapt
to injuries or replace an individualized assessment.

Completed sets are entered separately with actual reps/time and external load.
Blank or zero-work sets cannot be submitted. Logs survive routine deletion.
The progress report covers at most 92 days, with exercise history, best recorded
weight, external-load volume and primary-muscle set coverage. It does not infer
bodyweight load or grade technique. The UI shows the latest 28 days.

## Nutrition

The existing eight diets and Persian recipe catalog remain the source of meal
plans. Goal-based diet suggestions are comparisons and never select a diet
silently. Excluded ingredients are editable in the health profile. Matching
normalizes Persian/Arabic spelling and searches ingredient labels; this is not
an allergen ontology or cross-contamination checker.

Meal plans now include a serving multiplier (0.5–3) based on the daily calorie
share. Actual totals can differ from the target, and macros remain estimates.
Generation fails clearly when exclusions leave any meal type without a recipe.
A meal can be swapped only for a recipe matching the plan's diet, meal type and
current exclusions. Concurrent conflicting swaps return a conflict.

Shopping lists aggregate identical ingredients with identical per-serving amount
labels. They show the original amount and total serving multiplier, preserving
unlike units rather than inventing conversions. Existing saved plans without a
serving multiplier use one serving.

## API and MCP

REST endpoints under `/api/health`: `exercises`, `exercises/:slug`,
`exercises/:slug/alternatives`, `routines`, `routines/generate`, `routines/:id`,
`training-sessions`, `training-progress`, `diet-suggestions`,
`meal-plans/shopping-list`, `meal-plans/current/meal`.
Personal data is scoped to the authenticated user; video editing is admin-only.

Fourteen additional tools in `apps/api/src/tools/health-coach-tools.ts` expose
exercise discovery, routine creation/editing/deletion, completed sessions,
progress, diet suggestions, shopping and meal replacement to both MCP and the
in-app assistant. They use existing `health:read` / `health:write` scopes. New
structured inputs use the same camelCase field names and contracts as REST.
The assistant must never mark suggested sets as performed.

## Upgrade

Apply migration `20261030173000_health_coaching`, regenerate Prisma and run the
existing health seed to populate `health_exercises` (`seedHealth` is idempotent).
The root development seed includes it (`pnpm db:seed`); review the root seed's
account configuration before using it in production. Migration alone creates
an empty catalog. No production migration or deploy is performed by this change.

## Validation of this implementation

Verified locally with PostgreSQL 17: all migrations applied, the catalog seeded
with 36 exercises, TRX routine generation, user isolation, actual-set logging,
load-volume reporting, keeping logs after routine deletion, seven-day meal plans,
meal replacement, shopping aggregation and preserving video links on reseed.
Unit tests additionally cover unavailable equipment, blank completed sets,
Persian ingredient matching and keeping different shopping units separate.
