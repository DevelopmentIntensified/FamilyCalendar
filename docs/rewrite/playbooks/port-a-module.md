# Playbook: rebuild a module (steps S1–S9)

This playbook rebuilds one domain or screen. It is a **rewrite**, not a translation. The module's port sheet ([../modules/](../modules/)) supplies the facts: legacy files, routes, must-survive rules, tickets and split notes. Do the steps in order. Each step ends with a **check**; it must be green before you commit. Commit after every step. Push when the module is done (S9) or at the end of a session, after `npm run gate:push`.

## What is fixed and what is open

**Fixed.** These are external contracts; changing them is a separate, owner-approved ticket:

1. **The `/api` wire:** paths, methods, status codes, body fields, error messages, absent-versus-null rules. The Android app and TaskFocus are installed clients. The golden tests (S2) pin the wire.
2. **The schema:** tables, columns, migrations. No DDL.
3. **Domain rules:** [CONTEXT.md](../../../CONTEXT.md) and the sheet's "Must survive" list.
4. **What users see on approved pages:** layout, copy and behaviour. The visual check (S7) pins it.

**Open.** Redesign freely, and throw out what is bad:

- function and file boundaries, names, internal data shapes (page load data, component props);
- the legacy code structure;
- the legacy tests.

Copy legacy code only when it is correct, pure and worth keeping (NLP grammar, recurrence math), then reshape it to the conventions. When in doubt, write it fresh from the rule and the tests.

**Bugs** inside the module may be fixed during the rebuild:

- write the failing test first;
- name the ticket in the commit;
- note it in the sheet.

The exception is a fix that would change a fixed item above. That stays a ticket (see [carryover.md](../carryover.md)).

## S1: Behaviour inventory and design

1. Start from the sheet's **Behaviour inventory (draft)**: the API surface table, rules, UI behaviour and "probably accidental" list. It was extracted from the legacy code and tests on 2026-11-11, so verify each line you rely on against the cited `path:line`. Then run `npm run census -- <module>` and skim the legacy files and tests it lists, as **reference**. Each test file's kind tag says how much it is worth: `pure` tables often encode real rules, while `stub-db` mostly pins query shapes. `npm run census -- <module> --titles` prints every legacy test title as a checklist. You don't have to keep them.
2. Read the sheet's "Must survive", the module's rows in [carryover.md](../carryover.md), and the CONTEXT.md entries for the module's words.
3. Run `npm run new:module -- <module>`. It creates the folder, `README.md`, `index.ts`, `index.server.ts` and `ui/index.ts`.
4. Write the README sections:
   - **Invariants:** the behaviour inventory, one line per rule the module must keep. For each "probably accidental" item:
     - if it is visible on the `/api` wire, keep it and add it to [questions.md](../questions.md) for the owner;
     - if it is internal (dead code, inconsistent internals, a wrong comment), drop it and say why under the sheet's Notes.
   - **Public interface:** the services, endpoints and components the module will expose, designed now, before any code.
   - **Purpose** and **Depends on.**
5. Write the file plan in the sheet under "Plan": each new file with its role and what goes in it.

**Check:** `npm run arch && npm run docs:check`. Commit `rewrite(<m>): S1 inventory + design`.

## S2: Golden contract tests (`/api` only)

Follow [characterize-endpoints.md](characterize-endpoints.md). Every `/api/**` route of the module gets golden tests in `<m>.http.db.test.ts`, written against the route as it is today. Page routes get no goldens: their load data is internal and is redesigned with the UI.

**Check:** `npm run test:mod -- <m>`. The goldens pass on legacy code. Commit `rewrite(<m>): S2 api goldens (legacy green)`, and **write the commit sha in the sheet**. S6 proves they did not change.

## S3: Contract and rules

1. `<m>.contract.ts`: zod schemas for every `/api` request and response, matching the wire the goldens pin, with legacy error wording. Internal page/action input gets schemas too, designed fresh.
2. `<m>.<topic>.rules.ts`: the module's logic as pure functions ("now", zone and rows are passed in), designed from the Invariants. One file per topic, kept under about 300 lines.
3. `<m>.<topic>.rules.test.ts`: tables of input → expected output. Expected values come from the rule (CONTEXT.md, a worked example), never from running the code. Carry over legacy pure test cases that encode a real rule. The NLP phrase tables and parse vectors are mandatory.

**Check:** `npm run test:mod -- <m> && npm run arch`. Commit.

## S4: Repo

1. `<m>.repo.server.ts`: the queries the new services need. Not necessarily the legacy ones; design them for the new use-cases. Each takes `db: Db` first. Tables come from `$lib/kernel/db/tables.server`, and only the module's own tables plus declared reads may be touched (rule R3).
2. `<m>.fixtures.server.ts`: builders for this module's rows.
3. `<m>.repo.db.test.ts`: a `rollbackTest` for every query with a filter, ordering, join or upsert.

**Check:** `npm run test:mod -- <m> && npm run arch`. Commit.

## S5: Service

1. `<m>.service.server.ts`: one function per use-case, `(ctx, actor, input)`.
   - Authorization lives here.
   - Atomic work goes through `withTx`.
   - Time comes from `ctx.clock`, ids from `ctx.ids`.
   - Other modules are reached through their `index.server.ts`, and only lower ranks (rule R1).
2. `<m>.service.db.test.ts`: every Invariant that involves IO, each with a test titled after the rule. Assert refusals by `AppError` code.

**Check:** `npm run test:mod -- <m> && npm run arch`. Commit.

## S6: HTTP and route wiring

1. `<m>.http.server.ts`:
   - `/api` handlers use `endpoint()` and reproduce the wire exactly: auth mode, rate limit, status codes, bodies, messages.
   - Page loads and actions use `pageLoad()` / `formAction()`, shaped for the new UI.
2. Export them from `index.server.ts` and list them in the README.
3. Replace each route file with wiring only:

   ```ts
   import { submitBugReportEndpoint } from '$lib/domains/feedback/index.server';
   export const POST = submitBugReportEndpoint.handler;
   ```

**Check:**
- `npm run test:mod -- <m>`: goldens green.
- `git diff <S2 sha> -- src/lib/<domains|screens>/<m>/<m>.http.db.test.ts` prints nothing.
- `npm run arch`: R8 confirms wiring-only routes.

Commit.

**Owner-approved wire changes.** An answered question in [questions.md](../questions.md) may change this module's `/api` behaviour (for example Q-005a for `tasks`). Apply it only after the S6 check above has passed, as its own commit `fix(<m>): Q-NNN <summary>`:

1. Change the golden first, so it fails.
2. Change the code.
3. Name the question in the test title.

Never fold such a change into S6, and never change a golden without an answered question.

## S7: UI

Follow [port-ui.md](port-ui.md): rebuild the pages and components on kernel/ui primitives and state classes. Do not copy the legacy markup. Acceptance has two parts:

- the **visual check** for each page the module owns (K-10 harness, `npm run visual:check -- <m>`): it matches the legacy baseline captured before the rebuild, or every difference is intentional and listed in the sheet;
- the **perf check** (K-11, `npm run perf:check -- <m>`): every page is within its load budget ([ADR 0010](../../adr/0010-performance-budget.md)).

**Check:** `npm run test:mod -- <m> && npm run arch && npm run typecheck && npm run visual:check -- <m> && npm run perf:check -- <m>`. Commit.

## S8: Rewire, delete legacy

1. For each legacy source file still listed by `npm run census -- <m>`, point its importers at the module's public entries (legacy may import v2; v2 never imports legacy). Find them with:

   ```bash
   git grep -n "<basename>'" -- src e2e
   ```

2. `git rm` the module's legacy source files **and all of its legacy tests**. The inventory in the README Invariants, pinned by the new tests, replaces them. A legacy file that unported modules still import stays until they are rebuilt; note it in the sheet.

**Check:** `npm run gate` runs the v2 tests plus the legacy tests affected by your rewiring. `npm run census -- <m>` shows 0 legacy files (or only the noted ones). Commit.

## S9: Finish

1. README: the Files table covers every file (D2), every Invariant names the test that pins it, and Depends on lists Calls / Called by.
2. Tick the steps in the sheet and add Notes.
3. Run `npm run census -- --write`, then `npm run gate:push`.
4. Mark the ledger row `done`.
5. `git push origin rewrite/v2`.

## Screens differ in three ways

- No tables and no repo. The screen service composes domain services through their `index.server.ts`.
- The page's `/api` twin (for example `/api/dashboard`) is an `endpoint()` that returns the same composition as the `pageLoad()`. It has goldens; the page does not.
- Snippet composition happens here (for example the tasks checklist goes into calendar's `EventModal`).

## Size guards

- A file over about 400 lines is split by topic.
- A service function over about 60 lines is two use-cases.
- A component over about 250 lines needs a state class or a split.
