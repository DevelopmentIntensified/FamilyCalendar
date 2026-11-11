# 265 — TaskFocus: focus time reaches the phone (GET drops focusMinutes; add focusStartedAt)

Status: done

Source: TaskFocus ticket 079 live check against test.familyplanz.com (2026-10-30):
`PUT … focusMinutes: 42` → 200, next `GET /api/tasks` had no `focusMinutes`. Owner go-ahead
2026-11-01 to fix server-side and add `focusStartedAt` (the phone's "what is running" field).

## Done

- **Root cause:** `getTasksForUser` / `getTasksForFamily` / `sectionSelect` (queries.ts) list
  columns by hand and omitted `focusMinutes` — 211 persisted it, no reader returned it. All
  three now select `focusMinutes` + `focusStartedAt`. Pinned by a select-shape test
  (tasks.test.ts stub now captures each select's columns).
- **`focusStartedAt`:** `tasks.focus_started_at timestamptz` (migration 022, idempotent,
  bundled in scripts.ts → applied by the cold-start runner). Shared parser
  `src/lib/server/utils/focusStartedAt.ts`: absent → unchanged, `null` → clear (the desktop
  sends explicit null on stop), ISO string → Date, else 400 before any mutation. POST accepts
  it at create (absent/null → idle).
- Contract doc `docs/guides/task-api-spec.md` updated.
- Tests: +8 (5 PUT, 3 POST) + 1 select-shape; tasks/API/migrations suites 81/81. Full unit
  run: same 29 failing files before and after (pre-existing, stash-verified — real-Postgres
  pilots without a local DB, parse-event, etc.). svelte-check: 6 pre-existing tasks errors
  fixed, none added. `npm run build` green.

## Needs doing

- Owner: confirm 022 applied on preview/prod (cold-start runner, or `scripts/db-exec.mjs`
  with `.env.preview` / `.env.prod` — not available in the agent session).
