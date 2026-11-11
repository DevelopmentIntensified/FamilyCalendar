# 086 — No baseline: 21 tables exist only in the schema, and 003 contradicts it

Status: in-progress

Source: instruction — technical-debt sweep of schema, migrations, and dead code.

**Blocked by:** None (can start immediately) — but the first step is a manual
command the user must run, see Step 1.

## 🔴 FOUND 2026-10-03, against the live database — not a migration problem

Neon is connected, so the "manual schema dump" this ticket was blocked on is no
longer needed. `to_regclass` against **both** branches of
`hidden-resonance-16080139` (`main` and `preview/test`) gives the authoritative
answer, and it is not what anybody expected:

> **`grocery_store_colours` does not exist.**

It is declared at `schema.ts:973` and **eleven places read or write it** —
`groceries.ts:221-291` selects it, deletes from it, and inserts into it with
`onConflictDoUpdate` on two partial unique indexes. **#096's store colours are
broken in production.** The default name-hashed colour renders, so the feature
looks alive; the moment a person picks a colour, the write throws.

This is the whole class of bug #086 was filed to prevent, caught by looking at
the database instead of at the migrations — and it survived shipping, an
approval, a code review, and a prototype review cycle.

### The exact drift, both directions

| Table | In `schema.ts` | In the live DB |
|---|---|---|
| `grocery_store_colours` | declared (`:973`) | **MISSING** |
| `userAdConsent` | **not declared** | present, 0 rows |

Every other one of the 40 declared tables matches by physical name. So the
schema and the database are two near-identical lists that disagree twice, and
neither check looked.

Note the naming trap, recorded so the next person does not repeat my first
probe: `schema.ts` exports `groceryStoreColours` and `subscriptions`, but the
**physical** names are `grocery_store_colours` and `activeSubscriptions`
(`schema.ts:122` maps `subscriptions` onto `'activeSubscriptions'`). Diffing the
export names against the database reports four false mismatches.

A `DO $$ … INSERT … $$` probe was also attempted and returned nothing in either
direction, so it proved nothing and is not relied on. `to_regclass` returning
`null` is the evidence.

### APPLIED 2026-10-03

`grocery_store_colours` and all four indexes now exist on **both** branches,
created in a transaction from `schema.ts:973-998`. The DDL is also kept as
`sql/HAND-RUN-2026-10-03-store-colours.sql` for any other environment.

The constraint that matters was probed, not assumed: inserting a second
personal-scope row for the same store is **refused** by
`grocery_store_colours_user_store_unique` — that is what makes the scope flip a
single-statement upsert instead of a delete-then-insert. Probe rows were removed;
the table is empty, which is correct since nobody could write to it before.

- [x] **Create `grocery_store_colours`**, with both partial unique indexes.
- [ ] **#115's confirmed bug is now reachable.** `groceries.ts:60` keys the
      optimistic override map by `storeKey` alone while rebuilding `familyId`
      from the page's *current* scope control, so a personal colour is
      overwritten by a later family one and merely flipping "Everyone / Just
      me" re-labels an existing override. Until this minute that bug could not
      even be triggered, because every write threw. It can now.
      (Tracked with #115 — not part of the baseline work.)
- [x] `userAdConsent` — dropped on both branches 2026-10-04 as
      `sql/migrations/016-drop-user-ad-consent.sql` (owner instruction, #144).
      Stale probe text; kept for the record.
- [x] **The real baseline is now obtainable**: see Steps 1–6 — 0000-baseline +
      db-schema-diff + scratch-rebuild proof landed 2026-10-23.

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

- [x] **Step 1 (dump + diff).** `scripts/db-schema-diff.ts` (tsx) compares every
      `schema.ts` pgTable (physical names via `getTableName`) against
      `information_schema`, column by column. 2026-10-23: both Neon branches
      read **NO DRIFT** once 020 (below) dropped the two orphaned ad columns.
- [x] **Step 2 (baseline).** `sql/migrations/0000-baseline-tables.sql` — all 40
      schema tables (columns + indexes + FKs) generated from `schema.ts` via
      drizzle-kit, hand-adapted: guarded `CREATE TABLE IF NOT EXISTS` /
      `CREATE INDEX IF NOT EXISTS`, constraint adds wrapped in DO-blocks
      (`duplicate_object` catch) so re-runs are no-ops, `familyInviteCodes`
      FKs deferred to 010 with the same names. Bundled in `scripts.ts`
      (parity gate green).
- [x] **Step 3 (reconcile).** Live DBs already carried the schema shapes
      (step-1 ground truth proved it — the 003 divergence lost when the DBs
      were actually pushed), so the reconcile shrank to the two orphaned
      ad columns: `sql/migrations/020-drop-stale-ad-flag-columns.sql` drops
      `userSettings.showAdMarkers`/`personalizedAds` (undeclared since #088's
      single source). Applied to both Neon branches; 003 rewritten nowhere.
- [x] **Step 4 (retire a path).** One path remains: bundled `sql/migrations/`
      replayed by the runtime runner + the `scripts.test.ts` parity gate.
      Retired: `drizzle/` folder deleted, `drizzle.config.ts` deleted,
      `db:push`/`db:push:*`/`db:migrate` scripts removed, and
      `npm run db:apply` (`scripts/db-apply.mjs`) replaces local pushing.
      `drizzle-orm` stays as the runtime ORM.
- [x] **Step 5 (proof).** Fresh docker DB `scratch_rebuild` replayed all 21
      files in order (0000 first) with zero failures; then
      `db-schema-diff` against it: **NO DRIFT** (2026-10-23). Byte-parity
      between replayed files and the runtime bundle is enforced by the
      parity test.
- [x] **Step 6 (docs).** README + docker-compose quickstart now say `db:apply`
      (`db:push` retired); spec snapshot `02-schema.md` describes the single
      bundled path.

## Done

- **2026-10-23 — baseline landed.** Steps 1–6 above; ticket stays open for
  the two real-code residues: #115's groceries storeKey bug (now reachable
  that `grocery_store_colours` exists) and the stale `bills` tidbits noted
  under #087. All probes are one-command reproducible
  (`npx dotenv -e .env.prod -- npx tsx scripts/db-schema-diff.ts`).

## Notes

- SQL for every schema change goes to the user to run by hand, recorded here and
  in `sql/` — never relying on a push alone.
- `drizzle/` is **not** in the runtime path: the runner only reads
  `sql/migrations/`. But `drizzle-kit push` diffs the schema file against the
  live database, not against the folder, which is how all 39 tables got created
  without a migration.
- Ground truth for the real database beats both copies. Dump first, write second.

