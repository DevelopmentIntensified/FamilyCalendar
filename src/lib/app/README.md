# app

**app**, the composition root. This is the only place where real adapters are chosen and all the modules are wired together. Nothing else in `src/lib` imports `app`.

Domain words come from [CONTEXT.md](../../../CONTEXT.md). Architecture rules: [docs/architecture/rules.md](../../../docs/architecture/rules.md).

## Purpose

- **Owns:**
  - the production `Ctx` (`appCtx`);
  - while the rewrite is in progress, the bridges from that Ctx to legacy singletons;
  - later: the session pipeline used by `src/hooks.server.ts`, the cron cleanup that calls each module's retention function, and `/api/health`.
- **Does not own:** business rules. If app code starts deciding things, move that logic into a domain.

## Files

| file | role | what it does, and why it exists | tested by |
|---|---|---|---|
| [appCtx.server.ts](appCtx.server.ts) | composition | Builds the process-wide `Ctx`. Each bridge to legacy code is listed with the ledger task that removes it: the limiter must keep sharing legacy buckets until `access` is ported, and fault filing moves to the `feedback` service. | `src/hooks.server.test.ts` (legacy suite) runs the hooks that install it |
| [ports.server.ts](ports.server.ts) | composition | `wirePorts(ctx)` is the ONE place a domain's cross-module port is attached to a ctx: a domain declares the port in its `index.server.ts` and the owning module exports the adapter (family's and identity's planned first). `AppPorts` is empty today; each owning module's S5 adds its adapter here. | exercised through `goldenCtx` and the goldens that read a ported handler's effect |
| [testing/goldenCtx.server.ts](testing/goldenCtx.server.ts) | test harness | `goldenCtx(overrides)` = `testCtx` plus the real adapters, so a frozen `/api` golden sees the rows the other module writes. S5 service tests keep `testCtx` with memory fakes. | `src/lib/domains/*/*.http.db.test.ts` (the goldens) |

## Public interface

- `appCtx`: put on `event.locals.ctx` by [src/hooks.server.ts](../../hooks.server.ts) before any other hook runs. Route files and module code never import it. They receive it through `locals.ctx` and the HTTP builders.

## How to test

- The hooks wiring is exercised by the legacy `src/hooks.server.test.ts` (vitest project `server`). Run it with `npx vitest run --project server src/hooks.server.test.ts`.
- When the session pipeline moves here (task APP-03), it gets `app.*.test.ts` tests.

## Invariants

- `locals.ctx` and `locals.actor` are set on every request, before route code runs. `locals.actor` always mirrors `locals.user`: a bearer token gives `via: 'token'`, a cookie or anonymous account gives `via: 'session'`.
- Hook order stays: security headers, then API origin check, then session. Hooks are composed by hand, not with `sequence()`, so they can be invoked directly in tests (see the comment in `src/hooks.server.ts`).

## Depends on

- **May import:** anything. Prefer modules' public entries. Legacy imports are allowed here only, as transition bridges.
- **Owns tables:** none.
- **Called by:** `src/hooks.server.ts`.
