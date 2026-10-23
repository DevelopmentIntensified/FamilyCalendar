# 090 - Three tables have never been used: groups, userGroups, familyGroups

Status: done

Source: instruction - technical-debt sweep of schema, migrations, and dead code.

~~**Blocked by:** 086~~ (owner override 2026-10-23: the hand-run-DDL rule was
retired — `AGENTS.md` now mandates `scripts/db-exec.mjs` against Neon directly —
so the "cannot yet rebuild" concern turned into "record + bundle", which 019
satisfies).

## The problem

Three tables are declared in the schema, joined to each other and to real tables,
and read by nothing. No route, no query, no action, no foreign key points at
them. They are a Grouping feature that was designed and never built: a family
could have named groups, a user could belong to groups, and a group could be
scoped to a family.

The identifiers appear **only** at their own declarations. Every other hit for
"group" in the app is a local variable or prose.

Two end-to-end specs deleted `userGroups` rows in their cleanup helpers
(AccountDeletion.test.ts, FamilyCreation.test.ts) — test scaffolding writing to
a table the app never populates.

None of the three is created by any bundled migration either; they came from
the same push that created the other 18. See 086.

## Needs doing

- [x] Drop them and make the schema stop implying a feature exists.

## Done

- **2026-10-23 — dropped everywhere.** `sql/migrations/019-drop-unused-group-tables.sql`
  (`DROP TABLE IF EXISTS` child-first: `"userGroups"`, `"familyGroups"`, `"groups"`),
  applied via `scripts/db-exec.mjs` after verifying all three tables had **0 rows**
  on every target:
  - Neon main (`ep-plain-cloud`, `.env.prod` → GONE, verified `to_regclass IS NULL`)
  - Neon preview/test (`ep-bitter-water`, `.env.preview` → GONE, verified)
  - local docker (both `familycalendar` and `familycalendar_test` @ :5433 → GONE).
- Bundled in `src/lib/server/db/migrations/scripts.ts` — parity gate green
  (scripts.test.ts). Deployed environments replay 019 as no-op and mark it applied.
- Schema declarations removed (`schema.ts`: `familyGroups`, `groups`,
  `userGroups`, schema.ts:314-351 of the pre-commit tree) — grep confirms zero
  remaining references in `src/`.
- E2e cleanup helpers stopped deleting from `userGroups`
  (e2e/account/AccountDeletion.test.ts:13,76; e2e/family/FamilyCreation.test.ts:13,101).

## Notes

- Owner confirmed the Grouping feature is dead: the clobber instruction to run
  the pending DDL via Neon was them calling the "decide the fate" question.
- 086 (migration baseline) stays open — 019 only adds one more forward file;
  the reconcile/prove-rebuild work is untouched.
