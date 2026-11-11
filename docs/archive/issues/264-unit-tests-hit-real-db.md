# 264 — Unit tests leak to a real Postgres (eventDisplayService, parse-event)

Status: done

Source: repo bug audit 2026-11-01 (lane A).

## Evidence

`src/lib/server/services/eventDisplayService.test.ts` (event_exceptions query) and `src/routes/api/parse-event/server.test.ts` (userSettings query) fail with ECONNREFUSED 127.0.0.1:5433 without a DB.

## Repro

`npx vitest run` with no local DB -> 10 failures unrelated to code under test.

## Done

- `eventDisplayService.test.ts`: `vi.mock('$lib/server/db/actions/events')` spreads the real module and stubs `getExceptionsByEventIds` -> `[]`.
- `parse-event/server.test.ts`: `vi.mock('$lib/server/utils/userTimezone')` stubs `getUserZone` -> `undefined` (authenticated path hit userSettings).
- Red: 10 failures (3 `expandEventsForUser window`, 7 `POST /api/parse-event`) with no DB. Green: 15/15 pass under TZ=UTC and TZ=America/Chicago, no DB.

## Needs doing

(none)
