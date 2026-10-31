# ChatGPT connection (MCP)

Ported from Recall (`github.com/mojtabanpe/flashcard`, `server/MCP.md`) and extended with the
planner tools of TickTick's ChatGPT MCP and the health tools (CLAUDE.md directives 21, 23 and 25). Code:
`apps/api/src/mcp` (server, OAuth) and `apps/api/src/tools` (tool definitions shared with the in-app assistant).

## Connecting

1. Sign in to the customer app → **حساب کاربری** → **اتصال به ChatGPT**. Copy the server url
   (`https://poshtetgarm.ir/api/mcp`) and create a personal token (shown once).
2. In ChatGPT add a custom MCP connector with that url, authentication **OAuth**, client id and
   secret empty (dynamic client registration).
3. On the Persian consent page that opens, paste the personal token and confirm.

Personal tokens (`aio_mcp_…`) last 90 days and can also be sent directly as
`Authorization: Bearer aio_mcp_…`. Revoking a token ends every OAuth grant made with it.

## Permissions

`cards:read`, `cards:write`, `readings:read`, `readings:write`, `planner:read`, `planner:write`,
`health:read`, `health:write`. Tokens made before the health tools existed lack the health scopes: make a new one.
A token holds all of them by default (`POST /api/mcp/keys` accepts `scopes` to narrow it).

## Tools

- **English (Recall, 20):** `list_decks`, `get_deck`, `create_deck`, `update_deck`, `delete_deck`,
  `list_cards`, `get_card`, `search_cards`, `create_card`, `update_card`, `delete_card`,
  `move_card`, `review_card`, `suspend_card`, `unsuspend_card`, `list_readings`, `get_reading`,
  `create_reading`, `update_reading`, `delete_reading`.
- **Planner task queries:** `search_tasks`, `get_task`, `list_undone_tasks_by_time_query`
  (today, tomorrow, last24hour, next24hour, last7day, next7day), `list_undone_tasks_by_date`
  (≤ 14 days), `list_completed_tasks_by_date` (≤ 31 days), `filter_tasks`, `list_trash`.
- **Lists:** `list_lists`, `get_list` (sections, members), `list_folders`, `create_list`,
  `update_list`, `delete_list`, `create_folder`, `rename_folder`, `delete_folder`,
  `create_section`, `rename_section`, `delete_section`, `add_list_member`, `remove_list_member`.
- **Tasks:** `create_task`, `batch_create_tasks` (≤ 50), `update_task`, `batch_update_tasks`
  (≤ 50), `complete_task`, `complete_tasks_in_list` (≤ 20), `move_task`, `trash_task`,
  `restore_task`, `add_checklist_item`, `update_checklist_item`, `delete_checklist_item`,
  `assign_task`, `list_comments`, `add_comment`.
- **Tags:** `list_tags`, `create_tag`, `update_tag` (rename, colour), `delete_tag`.
- **Habits:** `list_habits`, `get_habit_checkins` (≤ 90 days), `list_habit_sections`,
  `create_habit_section`, `create_habit`, `update_habit`, `delete_habit`, `checkin_habit`
  (today or up to 90 days back).
- **Focus:** `list_focus_records` (≤ 1 month), `create_focus_record`, `update_focus_record`
  (note, task, start; the duration never changes), `delete_focus_record`.
- **Calendars:** `list_calendars`, `list_calendar_events` (≤ 92 days), `subscribe_calendar`,
  `unsubscribe_calendar`.
- **Countdowns:** `list_countdowns`, `create_countdown`, `update_countdown`, `delete_countdown`.
- **Health:** `get_health_profile`, `update_health_profile`, `get_nutrition_day`, `log_meal`, `update_meal`,
  `delete_meal`, `estimate_meal` (uses the user's own AI), `list_diets`, `list_recipes`, `get_recipe`,
  `get_meal_plan`, `generate_meal_plan`, `list_activities`, `list_workout_programs`, `list_workouts`,
  `get_fitness_week`, `log_workout`, `update_workout`, `delete_workout`.

The same tools (minus `delete_deck`, `delete_list`, `delete_habit`, list sharing and calendar subscription)
power the in-app assistant («دستیار» in the app header), which runs on the user's own AI settings.

Planner dates are calendar days in Tehran time. Every tool is scoped to the token owner and
validates input with the same Zod contracts as the REST api.

## Security

- OAuth: S256 PKCE, registered redirect hosts only (`MCP_REDIRECT_HOSTS`, default
  `chatgpt.com,chat.openai.com`; loopback http only outside production), browser-bound consent
  (cookie + Origin check), one-use 5-minute codes, 1-hour access tokens, rotating 30-day
  refresh tokens. Only SHA-256 hashes of tokens, codes and requests are stored (Postgres).
- `/api/mcp` accepts only bearer tokens (never the session cookie) and rejects foreign
  `Origin` headers. Protocol, OAuth and consent routes are rate limited and mounted before the
  cookie CSRF check; `/api/mcp/keys` stays behind it with session auth.

## Configuration

`MCP_PUBLIC_URL` is the public HTTPS origin of the api (e.g. `https://poshtetgarm.ir`); it is
required in production and never derived from the Host header. The reverse proxy must forward,
without rewriting: `/api/…`, `/authorize`, `/token`, `/register`, `/revoke`,
`/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource/api/mcp`.

## Native health coaching extension

Fourteen additional tools cover the exercise catalog, custom routines, actual set logs, progress, diet suggestions, shopping lists and meal replacement. See [health-coaching.md](health-coaching.md) for their behavior and upgrade steps. These tools use our own database and the existing health scopes; they do not call external fitness/nutrition platforms.

## Recurring planner tasks

Task tools now expose `repeat_rule`, `repeat_from`, `recurrence_end`,
`recurrence_timezone` and `duration_min`. Complete the returned occurrence handle,
not the series UUID. See [native recurrence and TickTick reconciliation](recurring-tasks.md)
for scopes, retry keys, supported RRULEs, preview/approval and reconnection steps.
