# Rewrite v2: plan

## Goal

Rebuild the website and server (`src/`) as ranked, documented, testable modules ([architecture](../architecture/README.md)). Keep the database schema, the URLs and the `/api` wire contract that the Android app and TaskFocus depend on ([ADR 0008](../adr/0008-keep-stack-schema-and-wire.md)).

The rewrite happens in place, one module at a time, and the app stays green and deployable after every task ([ADR 0003](../adr/0003-rewrite-in-place-module-by-module.md)).

## Definition of done

1. `npm run census` reports 0 legacy files in every module, and the legacy folders (`src/lib/server`, `utils`, `components`, `client`, `data`, `admin`, `marketing`, `conformance`) are gone.
2. Every route file is wiring-only (rule R8). `npm run arch` and `npm run docs:check` are clean.
3. `npm run gate:push` passes. The legacy vitest projects are deleted. The Playwright suite passes against a local build.
4. Every module's README Invariants (its behaviour inventory) are each pinned by a v2 test. Legacy tests are deleted with their module, not ported one by one.
5. Every `/api/**` endpoint has golden contract tests, and they stayed unchanged from the moment they went green on legacy code.
6. Every module has a README that passes D1/D2. The [carryover.md](carryover.md) items are each fixed, still open with a ticket, or waived by the owner.
7. The owner has signed off the cutover checklist below.

## Phases and order

The order follows dependencies: a module's legacy code only calls modules ported before it. The order lives in `PORT_ORDER` in [registry.mjs](../../scripts/arch/registry.mjs), and [LEDGER.md](LEDGER.md) lists every task.

| phase | tasks | what | why this order |
|---|---|---|---|
| K: kernel | K-01..K-03 (done), K-04..K-10 | Schema split, migrations home, shared time/client/UI primitives, test speed, visual baseline harness. | Everything later builds on these. |
| M: domains | 16 modules, feedback first | Each module goes through port-a-module steps S1–S9. | `feedback` is small and has no domain dependencies, so it is the worked example. It also replaces the app's fault-filing bridge. Then the base modules (identity, billing, alerts, dashboardModules, family), then leaves, then calendar, tasks and access. |
| S: screens | shell, account, admin, familyHub, dayDashboard, calendarPage | Compositions of ported domains. | They compose finished domains. calendarPage is the biggest and goes last. |
| A: app | APP-01..APP-07 | Cron, health, limiter swap, session pipeline, e2e, delete legacy, cutover. | Only possible once no legacy callers remain. |

Rough size (legacy LOC still owned, from `npm run census` on 2026-11-11): calendar ~10k, tasks ~8.3k, calendarPage ~6.3k, kernel-bound utilities ~3.9k, parsing ~3.2k (one 2.6k-line file), dayDashboard ~2.9k, account ~2.4k, every other module under ~1.5k.

## Decisions taken (defaults; the owner may overrule in [questions.md](questions.md))

| topic | default the plan uses |
|---|---|
| Changes on `test` during the rewrite | Frozen for website and server code until cutover, except urgent fixes (owner, [Q-001](questions.md)). Android work continues on `test`. The rewrite still merges `origin/test` before each module port. An urgent fix that touches an already-rebuilt module is redone in the v2 module, test-first ([sync-with-test.md](playbooks/sync-with-test.md)). |
| Parked modules (`bills`, `meals`) | Delete the unused code (owner, [Q-002](questions.md)): `/api/meals`, `MealsCard`, the meal queries, `parseBillQuickAdd` and the bill category list. The `bills`, `receiptItems`, `itemTags` and `meals` tables stay (no DDL). `meals` stays in the Dashboard Module list, so `/api/dashboard` and the family switches are unchanged. |
| Bugs inside a module | Fix them during its rebuild: failing test first, ticket named in the commit. Anything that would change the `/api` wire, the schema or a CONTEXT.md rule stays a ticket for the owner. |
| Legacy code and legacy tests | Reference only. Each module is redesigned from its behaviour inventory. Copy code only where it is correct and pure. Legacy tests are not a gate and are deleted with their module (S8). |
| Legacy markup | Rebuilt on `kernel/ui` primitives. The approved look is pinned by the visual check (K-10), not by copying markup. |
| Malformed JSON bodies | Now `400 {"error":"Invalid JSON"}` everywhere (some routes answered 500). Documented in task-api-spec.md during the port of each affected endpoint. |
| Schema / DDL | None during the rewrite. Any needed change is a separate owner-approved ticket (AGENTS.md rule). |
| In-process test database (PGlite) | Not used (owner stopped the spike). Docker Postgres only. |

## Risks and how the plan contains them

| risk | containment |
|---|---|
| Silent API drift breaks installed Android apps | Golden tests written against legacy before any endpoint changes. The spec doc is [task-api-spec.md](../guides/task-api-spec.md). The step order is never broken (S2 before S6). |
| Behaviour lost in the rebuild | S1 writes each module's behaviour inventory (README Invariants), starting from the draft inventory in its port sheet. Every invariant is pinned by a v2 test before the legacy code and tests are deleted. |
| Visual regressions on approved pages | The K-10 visual check compares each rebuilt page with a baseline captured from legacy before its rebuild, at phone and desktop widths. |
| Slow feedback loop | Legacy tests are not a gate (a full run took over 15 minutes). The loop runs one module's v2 tests (pure rules in node, rollback DB tests) plus only the legacy tests affected by the change. |
| A weaker agent drifts from the design | `npm run arch` (R1–R15), `npm run docs:check` and the typecheck ratchet run on every step. The playbooks give exact commands and stop conditions. |
| Long-lived branch diverges from `test` | Merge `origin/test` before each module; re-apply ported-module changes test-first. |
| NLP regressions | Parsing is ported test-first; phrase suites stay the floor. Parse vectors stay in lockstep with Android (145). |
| Tests touch production | Lane guards: unit tests have no database; db tests accept only `127.0.0.1:5433/familycalendar_v2_test`; config comes only through `ctx.config` (R6). |
| Build breaks on deploy, or a local build touches production | `gate:push` runs `npm run build:safe` (placeholder secrets, local DB, migrations off). Vercel previews of `rewrite/v2` currently fail before building ([Q-004](questions.md)), so `build:safe` is the only build proof until the owner answers. |

## Cutover

Only when the definition of done holds:

1. The owner reviews the preview deployment of `rewrite/v2` (test.familyplanz.com flows) and the census/ledger summary.
2. Merge `origin/test` one final time and run `npm run gate:push` plus Playwright.
3. The owner merges `rewrite/v2` into `test`. The usual test → main promotion gate applies afterwards ([archived #143](../archive/issues/143-the-promotion-gate.md)).
4. Archive `docs/rewrite/` into `docs/archive/rewrite-v2/`. The module READMEs and `docs/architecture/` remain as the permanent docs.
