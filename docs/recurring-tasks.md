# Native recurring tasks

Implementation: the existing NestJS planner services and Prisma `PlannerTask`,
Angular planner applet and shared tool registration (ChatGPT MCP and the in-app
assistant). No second task system or external scheduling service is involved.

## Architecture inspected

| Area               | Existing implementation reused                                                               |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Backend            | NestJS 12 planner controller, TasksService, PlannerAccess list membership                    |
| Persistence        | Prisma 7 multi-file PostgreSQL schema and additive SQL migrations                            |
| Validation         | Shared planner contracts using Zod mini; same schemas on REST and MCP                        |
| Queries            | TasksService.filter under Today/Tomorrow/Next 7 Days, overdue, lists and Calendar            |
| MCP                | Shared plannerTools registration consumed by MCP ToolKit and in-app assistant                |
| Frontend           | Angular 22 signals/httpResource, TasksPage, TaskDetail, calendar agenda and Spartan wrappers |
| Earlier recurrence | Subscribed-calendar ICS reader and import metadata; no native task series/completion engine  |

The one added dependency is pinned `rrule@2.8.1`. The existing small ICS feed
reader is preserved; it is not a task scheduler and does not provide the full
native RRULE/count/exception behavior needed here. IANA clock conversion uses
Intl, without another timezone dependency.

## Storage and scheduling

A series is a `planner_tasks` template (`isSeries=true`). A projected occurrence
has the stable public handle `<series UUID>@<original local YYYY-MM-DD>`.
One-off task IDs remain UUIDs. Date queries and `get_task` are read-only: they
project occurrences with `rrule` (RFC5545) and never fill the database with future
rows. Addressing an occurrence for a write snapshots it in the same task table;
`UNIQUE(seriesId, occurrenceDate)` prevents duplicate snapshots. Persisted
exceptions replace the matching projection, even after being moved or trashed.

- `date` and `time` on a series mean the wall clock in `recurrenceTimezone`.
  On an occurrence they mean the planner's existing **Asia/Tehran** calendar.
- Timed occurrences are converted using IANA/Intl rules, never a fixed offset.
  DST gaps skip nonexistent times without consuming COUNT; repeated wall clocks
  use their first instant, per RFC5545. All-day dates stay calendar dates.
- `durationMin` preserves elapsed duration, including imported start/due times.
  Priority, notes, tags, checklist, sections, assignment and list relationships
  are copied into occurrence snapshots. Checklist IDs are stable per occurrence.
- SCHEDULE leaves the cadence anchored to DTSTART. COMPLETION exposes only the
  pending occurrence; finishing it anchors the next one after the completion's
  local calendar day, retaining the configured clock and calendar constraints.
  Early completion never reuses the completed occurrence key; the next key stays
  after it. Skipping a pending COMPLETION occurrence advances once and consumes
  one occurrence, without recording a false completion.
  COUNT for COMPLETION is a total count across anchor advances. Once occurrences
  have been saved, switch between SCHEDULE and COMPLETION with FUTURE scope
  rather than rewriting the existing series' basis; SERIES scope rejects that
  ambiguous conversion.
- Completion and anchor advancement are serialized on the template in one
  transaction. Retries preserve the original completion timestamp. History is
  queried through the existing completed-date APIs. Reopening completed
  COMPLETION occurrences is rejected, since it would ambiguously rewind an
  already advanced series; scheduled-series occurrences can be reopened. A skipped COMPLETION occurrence
  cannot be restored after advancing; restore the whole trashed series instead.
- OCCURRENCE edits snapshot just that occurrence. SERIES changes the template
  and explicitly changed fields on pending snapshots, leaving completed history
  unchanged. Already moved date exceptions keep their dates when an entire
  series' anchor changes. FUTURE splits into a new template and truncates the
  old template before the selected key; completed future snapshots are excluded
  from the new template to prevent duplicates. Split retries return the same
  new template. A series UUID alone is not a completion/FUTURE target.
- Removing recurrence (`repeatRule: null`, SERIES scope) stops projections and
  trashes pending snapshots. The archived template and completed snapshots stay.
  Trashing an occurrence skips it; permanent purge records its exclusion before
  deleting its snapshot. Explicitly purging a series or its list removes its
  snapshots, consistent with the existing permanent-delete behavior.

Date windows remain inclusive and Tehran-based. Today/Tomorrow/Next 7 Days use
existing preset semantics; overdue tasks remain visible in the frontend. Calendar
uses the existing date-range task query. The frontend explicitly queries its
selected smart-list date window so a large overdue/global result cannot hide
Today. Selected lists/tags/assignment also query their own context; list and
tag badges count projected occurrences plus concrete pending tasks, excluding
templates and duplicate snapshots. Native result limits remain 500; a query without an end date projects at
most the next 366 days. Query later windows explicitly for later occurrences.
Pending overdue occurrences are calculated from the anchor, subject to that
result limit, rather than silently discarded. A series lookup is available for
expired or very distant schedules.

Supported rules: DAILY, WEEKLY, MONTHLY, YEARLY; INTERVAL, selected/ordinal BYDAY,
BYMONTHDAY, BYMONTH, BYSETPOS, BYYEARDAY, BYWEEKNO, WKST, COUNT, UNTIL. A separate
inclusive `recurrenceEnd` can further restrict the rule. COUNT and UNTIL in the
same RRULE are rejected. COUNT/INTERVAL are capped at 10,000. Multiple DTSTARTs,
RDATE/EXDATE input strings and sub-daily/BYHOUR/BYMINUTE/BYSECOND rules are rejected
explicitly; per-occurrence edits and skips cover exceptions. Gregorian RFC5545
month/year rules are used even though dates are presented in Persian.

## Compatibility with existing import metadata

Parallel changes on master added `externalSourceId`, `recurrenceRule`, `timeZone`,
`endTime` and `reminders` before the native recurrence engine. These fields and
habit import/check-in support are retained. New REST/MCP creates using those
legacy task fields are normalized into the same native engine; endTime can infer
elapsed duration, and imported completedAt becomes an occurrence snapshot while
the series remains active. Source-ID retries are safe even concurrently. Native
updates keep the supported aliases and reminder metadata synchronized.

Already saved metadata-only imports are **not automatically rescheduled** by a
migration or read request. They are marked `recurrenceNeedsReview` and included
in `list_recurring_tasks` for review. The existing unique externalSourceId is
accepted as an authoritative mapping during reconciliation, so an exact stored
source ID needs no separate existing_task_id. Otherwise supply an explicit map.
Review/apply the proposed conversion to activate the existing record as a native
series, retaining its task ID and completion history. No title matching is used.
The task editor also shows the legacy rule for explicit review/save.

## REST and MCP

Create/update/batch schemas accept camelCase on REST and snake_case on MCP:

| REST               | MCP                 | Meaning                                  |
| ------------------ | ------------------- | ---------------------------------------- |
| repeatRule         | repeat_rule         | RRULE, or null to stop a series          |
| repeatFrom         | repeat_from         | SCHEDULE (default), COMPLETION           |
| recurrenceEnd      | recurrence_end      | Inclusive local end date or null         |
| recurrenceTimezone | recurrence_timezone | IANA zone; Asia/Tehran by default        |
| durationMin        | duration_min        | Elapsed minutes or null                  |
| recurrenceScope    | recurrence_scope    | OCCURRENCE, FUTURE, SERIES (updates)     |
| idempotencyKey     | idempotency_key     | Caller-generated stable create retry key |

Existing create_task, update_task, batch_create_tasks, batch_update_tasks,
complete_task, complete_tasks_in_list, checklist/comment/assignment/move and
retrieval tools accept occurrence handles where they accept task IDs. Existing
queries return recurrence metadata and occurrence identities.

Additional tools: `list_recurring_tasks`, `get_task_recurrence`,
`update_task_recurrence`, `preview_ticktick_reconciliation`,
`apply_ticktick_reconciliation`. The apply tool is excluded from the in-app
assistant and requires the approved preview digest. Read/write scopes are
unchanged (`planner:read`, `planner:write`).

Example MCP flow (use actual returned IDs):

```json
{ "title": "Reading", "date": "2026-10-30", "time": "10:00", "duration_min": 15, "repeat_rule": "RRULE:FREQ=DAILY", "repeat_from": "SCHEDULE", "recurrence_timezone": "Asia/Tehran", "idempotency_key": "my-reading-series-v1" }
```

1. Call `create_task` with that object; keep its series ID.
2. Call `list_undone_tasks_by_time_query` with `query_command: "today"`.
3. Call `get_task` and then `complete_task` with the occurrence's returned task_id.
4. Query tomorrow; its occurrence is still open. Query completed tasks by today's
   completion date; the completed occurrence is retained.

## TickTick reconciliation: preview first, never title matching

The database migrations do **not** import, insert or reschedule existing tasks.
No production reconciliation is automatic. Reference fixtures in
`examples/ticktick-recurring-tasks.reference.json` describe the requested eight
schedules only; their `reference-*` IDs are not real TickTick IDs. Do not apply
that file to production.

Obtain the actual TickTick export IDs and native task IDs (via existing task
queries). For first-time binding supply `existing_task_id` explicitly unless the same
unique externalSourceId is already stored on the imported task. Two English
Class entries need separate IDs. There is no fuzzy/title matching and unmapped
entries fail. A later reconciliation can omit existing_task_id once bound by
`(userId, sourceProvider='ticktick', sourceId)`.

`preview_ticktick_reconciliation` input uses snake_case:

```json
{ "tasks": [{ "id": "ACTUAL_TICKTICK_TASK_ID", "existing_task_id": "ACTUAL_NATIVE_TASK_UUID", "start_date": "2026-10-30T10:00:00+0330", "due_date": "2026-10-30T10:15:00+0330", "time_zone": "Asia/Tehran", "repeat_flag": "RRULE:FREQ=DAILY", "repeat_from": "0" }] }
```

TickTick repeatFrom 0 is scheduled-date based, 1 is completion-date based.
Offsets with/without a colon are accepted; missing offsets are rejected.
The preview contains before/after schedules, task IDs/titles, expected update
versions, a SHA-256 digest and `creates: 0`. Show that exact output to the owner.
**Only after approval**, call `apply_ticktick_reconciliation` with the same tasks
and `approved_digest`. Changes, stale previews, conflicting source bindings,
multiple source IDs mapping to one native task and inaccessible tasks are refused.
Apply runs transactionally, preserves notes/tags/priority and existing completion
history, and creates zero root tasks. Repeat the preview/apply flow: unchanged
schedules are no-ops. Bindings are unique per owner and source ID.

Equivalent authenticated REST endpoints:
`POST /api/planner/ticktick/preview` and `/apply` (camelCase input; apply adds
`approvedDigest`). Series metadata: `GET /api/planner/tasks/recurring`.

## Verification and deployment

Migrations (additive; no resets or deletion of user data):

- `20261031120000_task_recurrence`: recurrence/source/idempotency columns, unique
  constraints and indexes, recurrence shape and duration checks.
- `20261031121000_recurrence_explicit_purge`: cascade the explicit permanent purge
  of a series to its snapshots; ordinary edits/completions never delete history.

Use the existing deployment pipeline. First deploy the migrations through the
existing API startup (`prisma migrate deploy`), then serve the matching API and
web bundle. Do not run TickTick apply as a startup hook. A database backup before
production migrations is recommended. Keeping these additive columns is safe
when rolling application code back; do not drop completion history.

Local verification uses an isolated PostgreSQL database named `aio_recurrence`
on localhost. Never point integration tests at production:

```sh
DATABASE_URL=postgresql://postgres:LOCAL_PASSWORD@127.0.0.1:25433/aio_recurrence pnpm nx run api-db:prisma-deploy
PLANNER_TEST_DATABASE_URL=postgresql://postgres:LOCAL_PASSWORD@127.0.0.1:25433/aio_recurrence pnpm nx run-many -t lint test build typecheck --parallel=1
pnpm nx run api-db:test-recurrence-migrations
pnpm nx format:check --all
```

The API integration suite tests the real Prisma services, the shared MCP handlers,
and the MCP SDK client/server transport. It refuses remote databases and requires
the dedicated database name; without the variable these integration cases skip.
Unit tests always run. CI provisions a separate PostgreSQL service, applies the
migrations to it and supplies this variable so these integration tests run in CI
when the API is affected. Test users are isolated and removed afterward. Production
users, task mappings and personal tokens are not used by tests.

After deployment, reopen/refresh the PWA (accept the new-version prompt). In
ChatGPT refresh the connected MCP tool list; reconnect the existing connector
only if its cached schemas omit repeat_rule. The server URL stays
`https://poshtetgarm.ir/api/mcp`; existing OAuth scopes/tokens do not change.
Then preview the real import mappings for approval before reconciling user data.
