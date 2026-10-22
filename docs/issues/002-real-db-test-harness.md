# 002 — Real-Postgres test harness for DB action tests

Status: open

## Done

- **Harness prerequisites verified 2026-10-22 (omp lane):** Docker comes up (`npm run db:up`, engine 28.0.1 after Desktop start); both databases exist; `familycalendar_test` recreated and schema-pushed green (**this surfaced a real schema mirror bug — `itemTags` partial-index WHERE clauses hardcoded `user_id`, the column is `"userId"` — fixed in schema.ts; the sql/ hand files always had the right names, so prod was never affected**). `package.json` keeps `db:up/db:down/db:reset/db:push(db|test)` procedures.
- **Drizzle-kit note:** `db:push` on the main local volume stops at a rename-conflict menu (`adConsentRecords` — create vs renamed from `sessions`/`userAdConsent`/`__schema_migrations`); test DB avoids it via recreate. **Correction to #116's claim: `events.creatorNames.test.ts` is ALSO a scripted `vi.mock('$lib/server/db')` stub (hand-rolled drizzle queue with capture assertions) — there is NO real-DB test precedent in the tree today; the pilot must be built fresh.**

## Needs doing

- Ten DB action/service test suites currently script the drizzle query-builder via `vi.mock('$lib/server/db')` (each carries a justified `oxlint-disable` comment referencing this issue):
  `advanceTaskToNext`, `calendar`, `calendarScope`, `dashboard.db`, `familyTaskSeam`, `taskMutation`, `toggleTaskComplete`, `undoRecurringCompletion`, `discountService`, `subscriptionService`.
- Replace the scripted stubs with a real harness on the local Docker Postgres (`npm run db:up`, test DB `familycalendar_test` via `.env.test`): per-suite schema push + truncate-between-tests, or per-worker throwaway schema.
- Then remove the disable comments; the `no-module-mocking` rule goes fully clean.
- Keep suites fast (<30s total); parallelize on distinct schemas if needed.
- **Harness setup contract (from the verification above):** tests must pin `familycalendar_test` explicitly (`db:push:test` is the canonical push; recreate on drift: drop/create database then push); the main local volume's push requires an interactive rename-answer — not part of the harness.
