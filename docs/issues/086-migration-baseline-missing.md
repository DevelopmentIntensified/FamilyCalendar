# 086 — No baseline: 21 tables exist only in the schema, and 003 contradicts it

Status: open

Source: instruction — technical-debt sweep of schema, migrations, and dead code.

**Blocked by:** None (can start immediately) — but the first step is a manual
command the user must run, see Step 1.

## The problem

A fresh database cannot be built from the migration runner. The runner replays
`sql/migrations/*.sql` in order, tracked by name in `__schema_migrations`. The
first bundled file's first statement is an `ALTER TABLE "userSettings"`, so on
an empty database the runner fails on migration 001 and every later migration is
skipped. There is no baseline and no way for the runner to tell "table
pre-existed" from "migration ran".

### 21 tables are created by nothing in `sql/migrations/`

Derived by set-differencing the 39 tables declared in the schema against the 18
`CREATE TABLE` statements in the bundled migrations:

    accounts, bills, calendars, codes, dashboardModuleSwitches, eventAttendance,
    events, families, familyGroups, familyInviteCodes, familyMembers, groups,
    meals, notifications, pushSubscriptions, sessions, taskCompletions,
    unmatchedPhrases, userGroups, users, userSettings

Seven of the other bundled files are ALTER/INDEX only — they assume their target
table already exists.

A third, unbundled `sql/` root folder holds 11 more psql-only files. Only one of
them creates a table (`bills`); the rest are ALTERs later bundled. `bills` is
therefore created by nothing the runner replays, while migration 013 ALTERs it —
so 013 hard-fails on any database that never ran that file by hand.

### `003` disagrees with the schema on 8 tables

003 is the drifted copy; the schema-matching shapes live in the `drizzle/` folder.
The worst cases:

- **waitlist** — 003 makes `email` the primary key and has no `id`; the schema
  has an `id` primary key and a plain non-unique `email`. A runner-built
  waitlist breaks on every write.
- **aiUsageTracking** — 003 is an `id` key with `feature`/`pointsUsed`/
  `periodStart`; the schema is a composite key of user + month + year. A
  different table.
- **adEvents** — 003's columns are all absent from the schema; every insert
  through the ORM fails.
- **subscriptionTypes** — nearly total divergence; most of 003's columns do not
  exist in the schema, and most of the schema's required columns do not exist in
  003.
- **discounts**, **userDiscounts** — renamed and missing columns.
- **activeSubscriptions** — divergent column set and nullability.
- **userAdConsent** — nullability only.

### `tasks` is created twice, differently

The bundled migration creates 9 columns; the `drizzle/` version creates 16. A
runner-built `tasks` is missing archived, recurrence, assignment, completion-count
and priority columns, so every recurring-task and priority query breaks.

## Needs doing

- [ ] **Step 1 (user, manual).** Dump the live schema and diff it against the
      schema file. We cannot pick a winner between 003 and the `drizzle/` copies
      until we know what the real databases actually have. The same drift has
      already bitten us once — see 050.
- [ ] **Step 2.** Write one baseline migration that creates the 21 uncovered
      tables in the **schema** shape, and have the runner record the existing
      migrations as already applied on databases that are past them, so nothing
      re-runs.
- [ ] **Step 3.** Do NOT edit 003 — it is already applied everywhere, and applied
      history is not rewritten. Add a new forward migration that reconciles all
      8 disagreeing tables plus `tasks` to the schema shape, idempotently.
- [ ] **Step 4.** Bring the `drizzle/` folder back in line (it is stale: one
      generated file is orphaned from its journal, six tables were never
      generated, and a task column added by hand never made it in), then pick
      **one** migration path and retire the other. Two paths pointed at one
      database is how the drift happened.
- [ ] **Step 5.** Prove it: build a scratch database from empty using the runner
      alone, and diff the result against the schema file.
- [ ] **Step 6.** Update the docs that describe both paths so they describe the
      surviving one.

## Done

## Notes

- SQL for every schema change goes to the user to run by hand, recorded here and
  in `sql/` — never relying on a push alone.
- `drizzle/` is **not** in the runtime path: the runner only reads
  `sql/migrations/`. But `drizzle-kit push` diffs the schema file against the
  live database, not against the folder, which is how all 39 tables got created
  without a migration.
- Ground truth for the real database beats both copies. Dump first, write second.
