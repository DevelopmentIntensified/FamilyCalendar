# 0007. Database tests run on real Postgres rebuilt from the migrations

Status: accepted (2026-11-11)

Repo, service and HTTP tests run against the local Docker Postgres (127.0.0.1:5433). The database is `familycalendar_v2_test`, dropped and rebuilt from `sql/migrations` at the start of every run, exactly the way production's runner applies them. That takes about 1.5 s for all 27 files. On 2026-11-11 the schema diff against `schema.ts` reported no drift.

Each test runs inside a transaction that is rolled back (`rollbackTest`); service transactions inside it become savepoints. Code that must commit, such as golden tests driving legacy handlers that use the `db` singleton, uses `truncateAll()` instead. Lane guards make db tests refuse any URL except the local test database, and make unit tests unable to reach any database.

## Why

Stubbed query builders tested the shape of queries, not their results, and broke on every refactor. A real database built from the migrations tests what production actually runs. It also catches any migration that would not apply to an empty database.

## Considered options

- **In-process Postgres (PGlite).** Not pursued: the owner stopped the spike on 2026-11-11. Docker Postgres is already the team's harness.
- **`drizzle-kit push` of `schema.ts` into the test database.** Rejected: that tests the TypeScript declaration, not the migrations production runs (see #086).
