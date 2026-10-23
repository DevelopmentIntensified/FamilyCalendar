# 002 — Real-Postgres test harness for DB action tests

Status: cancelled (owner 2026-10-22: local-db fixes made the stub-replacement sweep moot)

## Done

- **Harness prerequisites verified 2026-10-22 (omp lane):** Docker comes up (`npm run db:up`, engine 28.0.1 after Desktop start); both databases exist; `familycalendar_test` recreated and schema-pushed green (**this surfaced a real schema mirror bug — `itemTags` partial-index WHERE clauses hardcoded `user_id`, the column is `"userId"` — fixed in schema.ts; the sql/ hand files always had the right names, so prod was never affected**). `package.json` keeps `db:up/db:down/db:reset/db:push(db|test)` procedures.
- **Drizzle-kit note:** `db:push` on the main local volume stops at a rename-conflict menu (`adConsentRecords` — create vs renamed from `sessions`/`userAdConsent`/`__schema_migrations`); test DB avoids it via recreate. **Correction to #116's claim: `events.creatorNames.test.ts` is ALSO a scripted `vi.mock('$lib/server/db')` stub (hand-rolled drizzle queue with capture assertions) — there is NO real-DB test precedent in the tree today; the pilot must be built fresh.**

- **Pilot landed (7d9dfd4, 2026-10-22):** `toggleTaskComplete.real.test.ts` — 6 real-Postgres tests through the UNMOCKED seam (plain complete + actor attribution, **the double-click race: two concurrent toggles → exactly 1 history row under a real row lock**, append-only un-complete, repeat-completion, outsider refusal, family-member leg). Suite 4.5s incl. truncate; full suite 3681/3681 green.
- **Lane guard:** `vitest-setup-server.ts` hard-pins `DATABASE_URL` to `postgres://postgres:postgres@127.0.0.1:5433/familycalendar_test` for every server-test file **before** the `$lib/server/db` singleton resolves (closes the local-runs-touch-prod class from the 2026-10-21 outage), sets `DATABASE_DISABLE_MIGRATIONS=1`, and fails loud if the env drifts off the harness db. Hooked into the `server` vitest project in vite.config.ts.

## Needs doing

- Ten DB action/service test suites currently script the drizzle query-builder via `vi.mock('$lib/server/db')` (each carries a justified `oxlint-disable` comment referencing this issue):
  `advanceTaskToNext`, `calendar`, `calendarScope`, `dashboard.db`, `familyTaskSeam`, `taskMutation`, `toggleTaskComplete`, `undoRecurringCompletion`, `discountService`, `subscriptionService`.
- Replace the scripted stubs with a real harness on the local Docker Postgres (`npm run db:up`, test DB `familycalendar_test` via `.env.test`): per-suite schema push + truncate-between-tests, or per-worker throwaway schema.
- Then remove the disable comments; the `no-module-mocking` rule goes fully clean.
- Keep suites fast (<30s total); parallelize on distinct schemas if needed.
- **Harness setup contract (from the verification above):** tests must pin `familycalendar_test` explicitly (`db:push:test` is the canonical push; recreate on drift: drop/create database then push); the main local volume's push requires an interactive rename-answer — not part of the harness.


## Cancelled 2026-10-22

- Owner ruling (2026-10-22): cancel — "local db fixes" make the stub-replacement sweep
  moot. What landed and stays: the harness prerequisites (vitest-setup-server.ts pin) and
  the pilot `toggleTaskComplete.real.test.ts` running against real Postgres. The scripted
  stub suites are NOT converted; #116 closed on the same ruling.
