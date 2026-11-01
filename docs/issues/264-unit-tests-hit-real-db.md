# 264 — Unit tests leak to a real Postgres (eventDisplayService, parse-event)

Status: open

Source: repo bug audit 2026-11-01 (lane A).

## Evidence

`src/lib/server/services/eventDisplayService.test.ts` (event_exceptions query) and `src/routes/api/parse-event/server.test.ts` (userSettings query) fail with ECONNREFUSED 127.0.0.1:5433 without a DB.

## Repro

`npx vitest run` with no local DB -> 10 failures unrelated to code under test.

## Done

(none yet)

## Needs doing

- Mock the missing db calls in those suites.
- Red test first where a seam exists (`tdd`).
