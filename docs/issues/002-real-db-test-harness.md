# 002 — Real-Postgres test harness for DB action tests

Status: open

## Needs doing

- Ten DB action/service test suites currently script the drizzle query-builder via `vi.mock('$lib/server/db')` (each carries a justified `oxlint-disable` comment referencing this issue):
  `advanceTaskToNext`, `calendar`, `calendarScope`, `dashboard.db`, `familyTaskSeam`, `taskMutation`, `toggleTaskComplete`, `undoRecurringCompletion`, `discountService`, `subscriptionService`.
- Replace the scripted stubs with a real harness on the local Docker Postgres (`npm run db:up`, test DB `familycalendar_test` via `.env.test`): per-suite schema push + truncate-between-tests, or per-worker throwaway schema.
- Then remove the disable comments; the `no-module-mocking` rule goes fully clean.
- Keep suites fast (<30s total); parallelize on distinct schemas if needed.

## Done

- (nothing yet)
