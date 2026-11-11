# 0005. Dependencies arrive through ctx; no module mocking

Status: accepted (2026-11-11)

Every service takes a `Ctx` as its first argument: `fn(ctx, actor, input)`. `Ctx` bundles every side-effecting dependency: db, clock, ids, log, rate limiter, fault reporter, config, and later mail/push/AI/HTTP. Production builds one `Ctx` in `src/lib/app/appCtx.server.ts`, and hooks put it on `locals.ctx`. Tests build one with `testCtx()` and swap any piece. Module mocking (`vi.mock`) is banned in v2 tests (rule R9). Reading the clock or environment directly is banned in v2 code (R5, R6).

## Why

Legacy server code imports a `db` singleton that reads `DATABASE_URL` when the module loads, and calls `Date.now()` freely. Its tests must therefore mock modules: 26+ suites hand-build drizzle query-builder stubs that pin query shapes instead of behaviour. A `.env` mistake once ran local tests against production. Passing dependencies explicitly makes every service testable through its real interface, with deterministic time.

## Considered options

- **A DI container or decorators.** Rejected: magic a weaker agent can't follow. A plain object argument is greppable.
- **Narrow `Pick<Ctx, …>` per service.** Rejected for now: one signature everywhere is simpler, and `testCtx()` already provides every port.
- **Repository interfaces with in-memory fakes per table.** Rejected: fakes drift from SQL semantics. Services are tested against real Postgres instead (ADR 0007). Only outbound effects get fake adapters.
