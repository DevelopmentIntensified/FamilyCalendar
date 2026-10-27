# Family Planz 👪

Family calendar + tasks + bills. Live at https://familyplanz.com.

## Stack

SvelteKit 2 + Svelte 5 · Postgres (Drizzle) · Tailwind 4
· Vercel. Native Android app lives at `apps/android/` (Kotlin + Compose). Local DB via Docker (`db:up`). Schema: bundled SQL migrations, applied by the runtime runner at first server start (#086); locally via `npm run db:apply`.

## Quickstart

```sh
npm i
npm run db:up        # local Postgres :5433
npm run db:apply    # bundled schema -> local DB
npm run db:seed      # seeded users (tests use these, never real emails)
npm run dev
```

Build before every push: `npm run build` → `git push origin test`
(`test` auto-deploys to test.familyplanz.com; `main` = production).

## Docs map

| Path | What |
| --- | --- |
| `CONTEXT.md` | Canonical domain language (Anonymous Account, Claiming, cursor semantics…) |
| `AGENTS.md` | Agent working rules (terse, TDD, issue flow, git flow) |
| `docs/STATUS.md` | Done/Open rollup of the tracker |
| `docs/issues/` | The tracker: `NNN-slug.md`, one concern per file |
| `docs/plans/` | Roadmaps + feature plans (may be stale — issues win) |
| `docs/guides/` | Perf playbook, e2e instructions |
| `docs/adr/` | Architecture decisions |
| `docs/research/` | Competitor notes |
| `docs/archive/` | Superseded planning (SPEC, old language draft, todo) |

## Conventions

- Issues: start → `Status: in-progress`; finish → `Done` + `done`, build green.
- DB: one schema path - bundled `sql/migrations/` replayed by the runtime runner + the parity gate (scripts.test.ts). Schema SQL applied via `scripts/db-exec.mjs` against Neon (or `npm run db:apply` locally). `drizzle-kit push` path retired (#086).
- Tests: `vitest` unit (colocated `*.test.ts`), `playwright` e2e. New NLP
  surface = table-driven phrase suite first.
- Lint: `oxlint` (custom anti-slop plugin in `tools/oxlint/`) + prettier.
- `build/` + `test-results/` are gitignored local output.
- `.env*` never gets read or committed — secrets stay out of context.
