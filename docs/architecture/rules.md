# Rules

Rules `R1`–`R15` are checked by `npm run arch`. Rules `D1`–`D4` are checked by `npm run docs:check`. Every failure message names its rule, so look it up here before fixing. The rules apply to v2 code (`src/lib/{kernel,domains,screens,app}`) and to route files that use it. Legacy code isn't checked; it gets deleted module by module.

To fix a violation, change the code. Never weaken a check: `scripts/arch/*` changes only as part of a ledger task that says so.

## r1

**R1: Layering.** Kernel imports only kernel. A domain imports only domains with a lower rank (see [modules.md](modules.md)). A screen imports domains and kernel, never another screen. Only `app` imports everything.

- *Why:* there can be no import cycles, and a module's dependencies are visible from its rank.
- *Fix:* if a lower module needs something from a higher one, invert the dependency:
  - the caller passes a callback or a value;
  - the dependency becomes a ctx port ([add-a-port.md](../rewrite/playbooks/add-a-port.md));
  - in UI, the higher screen passes a Svelte snippet (for example, `EventModal` takes a `checklist` snippet from tasks).

## r2

**R2: Public entries.** Another module may be imported only through its `index.ts` (isomorphic: types, contracts, rules, client api), `index.server.ts` (services, http handlers) or `ui/index.ts` (components). Kernel files are imported directly.

- *Why:* the entry files are the module's interface. Everything else can be refactored without touching callers.
- *Fix:* export the thing from the right entry file (and list it in the README's Public interface), then import it from there.

## r3

**R3: Database access lives in repos.** `drizzle-orm`, `postgres` and `$lib/kernel/db/tables.server` may be imported only by `*.repo.server.ts`, `*.fixtures.server.ts`, `*.db.test.ts`, `kernel/db` and `kernel/testing`. A repo may touch only the tables its module owns (`TABLE_OWNERS` in [registry.mjs](../../scripts/arch/registry.mjs)), plus read-only joins declared in `FOREIGN_READS`.

- *Why:* `grep repo.server` finds every query, and only the owner of a table writes to it.
- *Fix:* move the query into the owning module's repo, and call that module's service. If you genuinely need a read-only join, add a `FOREIGN_READS` entry with its reason, in the same commit.

## r4

**R4: Pure files stay pure.** `*.rules.ts` and `*.contract.ts` must not import `$app`, `$env`, `@sveltejs/kit`, `drizzle-orm`, `postgres`, `node:*` or any `.server` file. They must not call `fetch`, browser storage or DOM globals.

- *Why:* pure rules are tested with plain tables of input → output, and run in both browser and server.
- *Fix:* pass the value in as a parameter (`now`, the user's zone, the rows), or move the IO into a service.

## r5

**R5: No hidden clock or randomness.** `Date.now()`, `new Date()`, `DateTime.now()`, `DateTime.local()` and `Math.random()` are banned outside `kernel/time`, `kernel/ids`, `kernel/testing` and `app`.

- *Why:* time-dependent bugs (cursor dates, rollovers, "today") must be reproducible. Tests pin the time with `testCtx({ now })`.
- *Fix:* read `ctx.clock.now()` in services. Rules take `now: Date` as a parameter. Ids come from `ctx.ids.id()`.

## r6

**R6: Environment access lives in app.** `process.env` and `$env/*` are allowed only in `src/lib/app` (and test setup).

- *Why:* config is read once and passed down, so tests never depend on the developer's `.env` file (the 2026-10-21 incident).
- *Fix:* add the field to `AppConfig` (`kernel/ctx/ctx.server.ts`), read it in [appCtx.server.ts](../../src/lib/app/appCtx.server.ts), and use `ctx.config.x`.

## r7

**R7: Server-only files say so.** A non-test file that imports a `.server` file, `drizzle-orm`, `postgres`, `node:*` or `$env` must itself be named `*.server.ts`.

- *Why:* SvelteKit refuses to bundle `.server` files into browser code. With the suffix in the name, a mistake fails at build time instead of leaking server code.
- *Fix:* rename the file to `*.server.ts`, or split the server part out.

## r8

**R8: Routes are wiring only.**

- A `+server.ts`, `+page.server.ts`, `+layout.server.ts`, `+page.ts` or `+layout.ts` file that uses v2 code may contain only imports and `export const X = …`, with no functions, `await`, `if`, `return` or `new`.
- A `+page.svelte` or `+layout.svelte` file that uses v2 code stays at 25 lines or fewer, with no `fetch`, runes state or `<style>`. It renders one screen component.

- *Why:* all behaviour lives in modules where it is tested and documented. Routes only map URLs to modules.
- *Fix:* move the logic into the module's `*.http.server.ts` or its screen component.

## r9

**R9: No module mocking in v2 tests.** `vi.mock` and `vi.doMock` are banned.

- *Why:* mocks test wiring instead of behaviour, and they rot. Dependencies come in through `ctx` or as props.
- *Fix:* use `testCtx()` and swap a port, use `rollbackTest` for real database behaviour, or pass the api as a constructor or prop argument.

## r10

**R10: Unique file names.** No two v2 files share a basename. `index.ts`, `index.server.ts` and `README.md` are exempt.

- *Why:* `glob **/tasks.repo.server.ts` and grep results each point at exactly one file.
- *Fix:* prefix the file with its module noun, following the role naming in [conventions.md](conventions.md#file-roles).

## r11

**R11: Unique exported names.** No two v2 files define the same exported function, const, class, type or interface. Route handler names (`GET`, `load`, …) and re-exports in entry files are exempt.

- *Why:* `grep "export function createTask"` finds the one definition, and a concept can't fork under the same name.
- *Fix:* name exports with the module noun (`createTask`, not `create`). If the name already exists elsewhere, reuse that concept instead of copying it.

## r12

**R12: Registered modules with a README.** Every folder under `domains/` or `screens/` must be registered in [registry.mjs](../../scripts/arch/registry.mjs) under that kind, and every module with code has a `README.md`.

- *Why:* the registry is the map, and the README is the entry point for each module.
- *Fix:* run `npm run new:module -- <name>`, which only works for registered names. Adding a module to the registry is a ledger decision.

## r13

**R13: Tests next to logic.** Every `*.rules.ts`, `*.repo.server.ts`, `*.service.server.ts` and `*.http.server.ts` has a test file in the same folder whose name starts with the same stem, for example `tasks.repo.db.test.ts` next to `tasks.repo.server.ts`.

- *Why:* a weaker agent can verify any file it touches by running the test with the same stem.
- *Fix:* add the test. Rules use table tests. Repos, services and http use db tests ([testing.md](testing.md)).

## r14

**R14: No legacy imports from v2.** v2 code must not import `src/lib/server`, `utils`, `components`, `client`, `data`, `admin`, `marketing`, `conformance`, `types.ts` or `dashboardModules.ts`. The exceptions are `app` and the schema bridge `kernel/db/tables.server.ts`, plus any entry in [legacy-bridges.json](../../scripts/arch/legacy-bridges.json).

- *Why:* legacy code reads the `db` singleton outside the test transaction, so new tests would leak and flake. It also never gets deleted if new code keeps leaning on it.
- *Fix:* port the dependency first: its module comes earlier in `PORT_ORDER`, and a small helper moves into kernel. A bridge is a last resort, with `reason` and `removeBy`.

## r15

**R15: Files named by role.** Files in a domain or screen (outside `ui/`) are named `<module>.<topic>.<role>[.server].ts`, where role is one of `rules | contract | repo | service | http | api | state | fixtures`. `ui/` holds PascalCase `.svelte` components, their `*.svelte.test.ts` files and `index.ts`.

- *Why:* a file's name says what it may contain and how it is tested. The roles are described in [conventions.md](conventions.md#file-roles).

## d1

**D1: README sections.** A module README has `## Purpose`, `## Files`, `## Public interface`, `## How to test`, `## Invariants` and `## Depends on` ([template](module-readme-template.md)).

## d2

**D2: README covers the folder.** The Files table links every file in the module folder, tests included. Links to deleted files fail the check.

## d3

**D3: Links resolve.** Every relative link in AGENTS.md, CONTEXT.md, `docs/` (except `docs/archive/`) and module READMEs points at a file that exists.

## d4

**D4: AGENTS.md stays a hub.** AGENTS.md has at most 120 lines. Move detail into a linked doc.
