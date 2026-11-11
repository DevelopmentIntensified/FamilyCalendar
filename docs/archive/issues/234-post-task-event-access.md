# 234 — POST /api/tasks attaches to any eventId without access check; bad input 500s

Status: done

Source: repo bug audit 2026-11-01 (lane C).

## Evidence

`src/routes/api/tasks/+server.ts:122` `eventId: body.eventId || null` unchecked; list joins event title/start. Unknown eventId -> FK 500; invalid dueDate -> 500.

## Repro

User with another family's event id reads its title/start; garbage dueDate returns 500.

## Done

- `src/routes/api/tasks/+server.ts`:
  - new `eventAccess(userId, eventId)` (`missing | denied | ok`: event owner, or an accessible calendar), shared by the GET `?eventId=` filter (same behaviour) and POST.
  - POST: non-string eventId -> `400 Invalid eventId`; unknown -> `400 Event not found`; unreadable -> `403 No access to this event`; all before any write.
  - POST: dueDate must be a strict ISO date/datetime (luxon `fromISO`) -> else `400 Invalid dueDate`; omitted / null / '' stays undated. Every in-app POST caller already sends ISO (`toISOString` / `YYYY-MM-DD`).
- `docs/guides/task-api-spec.md`: the four new POST errors.
- Tests `api/tasks/server.test.ts` › `eventId access + dueDate validation (#234)` (owned event, family-calendar event, foreign 403, unknown 400, 3 non-string ids, empty ids, 5 bad + 3 good dueDates, empty dueDates) — 10 red -> green. Test body type widened to `Record<string, unknown>` (also clears 3 pre-existing svelte-check errors in that file).

## Needs doing

(none)
