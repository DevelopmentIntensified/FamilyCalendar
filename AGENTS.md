# AGENTS.md: start here

Family Planz is a family calendar.

- **Website and server:** SvelteKit in `src/`, Postgres on Neon, deployed on Vercel.
- **Android app:** `apps/android` (Kotlin), a client of the `/api` contract.
- **Domain language:** [CONTEXT.md](CONTEXT.md). Use its words exactly.

## Read next: only what your task needs

| your task | read |
|---|---|
| executing the v2 rewrite (branch `rewrite/v2`) | [docs/rewrite/README.md](docs/rewrite/README.md) |
| changing website/server code | [docs/architecture/README.md](docs/architecture/README.md), then the `README.md` of the module you touch |
| writing or running tests | [docs/architecture/testing.md](docs/architecture/testing.md) |
| natural-language parsing (quick-add, dates) | [testing.md, NLP section](docs/architecture/testing.md#natural-language-parsing): test-first, phrase tables |
| writing Svelte | [docs/guides/svelte-mcp.md](docs/guides/svelte-mcp.md) |
| the `/api` contract (Android, TaskFocus) | [docs/guides/task-api-spec.md](docs/guides/task-api-spec.md) |
| the Android app | [docs/README.md, Android section](docs/README.md#android) |
| filing or working an issue | [docs/issues/README.md](docs/issues/README.md) |
| verifying on test.familyplanz.com | [docs/guides/test-site.md](docs/guides/test-site.md) |
| any other doc | [docs/README.md](docs/README.md), the map of every live doc |
| history (old tickets, old status, old plans) | [docs/archive/README.md](docs/archive/README.md), only when researching |

## Working style

- Delegate to subagents early and often, and batch independent work in parallel. It is usually faster. Verify their work afterwards: read the diff, re-run the checks.
- Implementation subagents follow the `tdd` skill: red → green, tests first wherever a seam exists.
- Research subagents move fast: breadth-first, skim, report `file:line` evidence.
- Caveman mode is the default: terse, no filler. Use full sentences only when explaining on request.

## Unknowns

- **Control mode** (the user is driving): when the docs and code don't answer it, ask with the `grill-with-docs` skill. Never guess.
- **Hands-off mode** (the user is AFK, or says "grind"/"continue"): assume from CONTEXT.md, the docs and past answers, and list every assumption at the end.
- A genuine fork goes to the owner as options with costs. Irreversible DDL always asks.

## Code correctness

- Syntax first: every edit must parse. Balance brackets, parens and quotes before moving on. Re-read the touched region, or run its fastest check, right after each edit.
- The bugs that surface should be logic mistakes caught by tests. Typos, broken imports and unbalanced delimiters must never reach the suite or a push.

## Git

- Run `npm run build` before every push. Never push a broken build. On `rewrite/v2`, run `npm run gate:push`, which builds through `build:safe`: placeholder secrets and the local DB, because the main checkout's `.env` points at production.
- Push to `test` (`git push origin test`) unless told otherwise.
- Website and server code on `test` is frozen until the rewrite's cutover, except urgent fixes (owner, 2026-11-11). Android work continues on `test`.
- Rewrite work lives on branch `rewrite/v2` (worktree `../fc-v2`) and pushes to `origin rewrite/v2`. Never merge it into `test`/`main`; that is the owner's cutover.
- Push as you complete: commit and push each finished slice.

## Database

- Never print `DATABASE_URL`. Tests only ever use the local Docker Postgres (`npm run db:up`).
- Owner override (2026-10-23): schema SQL runs directly against Neon using `scripts/db-exec.mjs`, with `.env.prod` for main and `.env.preview` for test.
- Still record the DDL in `sql/migrations/` and its ticket, and bundle it in the migrations scripts file (parity test). Don't rely on `drizzle-kit push`.

## UI

- Every interaction acknowledges within 100 ms (optimistic update or pending state). Confirm with a toast or inline status that names what happened and what comes next.
- Never use a bare `alert()` or a silent reload. Loading states are skeletons, not blank cards.
- Service worker: bump the cache keys in `static/service-worker.js` (`familyplanz-vN` and `familyplanz-data-vN`) in the same commit as any change to brand assets, `static/manifest*.webmanifest` or `src/app.html`. Otherwise the cache serves stale icons and manifest (incident: 491a745, fixed after the fact by 0964fd3).

## Tooling

- Run Playwright directly (`npx playwright test`). The `playwright-cli` skill is deprecated in this project.

## Content (owner directive)

- Never use LGBT/trans emoji: no rainbow flag, no trans symbol, no couple-pair 👫👬👭, and no same-sex or gender-neutral family combinations. Family imagery is man + woman + children only. The approved forms are 👪 and 👨‍👩‍👧‍👦. This applies to UI copy, notifications, empty states and docs.

## Guiding verses (why we build this way)

- Psalm 127:1 — Except the LORD build the house, they labour in vain. Build for Him first.
- Proverbs 16:3 — Commit thy works unto the LORD, and thy thoughts shall be established. Plan, then commit.
- Proverbs 15:22 — Without counsel purposes are disappointed: but in the multitude of counsellors they are established. Grill, TDD, review.
- Proverbs 21:5 — The thoughts of the diligent tend only to plenteousness. Small slices, pushed green.
- Proverbs 16:9 — A man's heart deviseth his way: but the LORD directeth his steps. Hold plans loosely.
- Proverbs 24:3-4 — Through wisdom is an house builded; and by understanding it is established. Architecture matters.
- Proverbs 22:6 — Train up a child in the way he should go. Families first in every UX call.
- Ecclesiastes 3:1 — To every thing there is a season, and a time to every purpose. Calendar is stewardship of time.
- Ecclesiastes 4:9-10 — Two are better than one... if they fall, the one will lift up his fellow. Family Task Board energy.
- Psalm 90:12 — Teach us to number our days, that we may apply our hearts unto wisdom. Day Dashboard in one line.
- Psalm 127:3 — Lo, children are an heritage of the LORD. Kids' Schedule is ministry, not a feature.
- Psalm 118:24 — This is the day which the LORD hath made; we will rejoice and be glad in it. Ship today something worth rejoicing in.
