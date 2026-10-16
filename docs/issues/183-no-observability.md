# 183 — No error tracking, no uptime, free-text logs
Status: open
Source: production-readiness operations audit, 2026-10-16. Before-money blocker.
## Done
- Zero Sentry/uptime/latency/alerting anywhere (`package.json` has no observability package; grep finds only `console.*`). No way to detect an outage or page a human.
- Logging is free-text/interpolation (`[KPI]` lines `analyticsService.ts:44-61`; `tasks.ts:349-353` dumps JSON.stringify to a debug log) — not structured/searchable as emitted. PII scrub already tracked in #169 (referenced, not duplicated).
- Structured JSON logging shipped: `src/lib/server/services/logger.ts` (`logEvent`); `[KPI]` lines and the `tasks.ts` debug dump now emit `{ts, level, event, ...ctx}` records. PII scrub stays with #169. (2026-10-16)
- `GET /api/health` shipped: unauthenticated 200 `{ok, db}` with a 1s-bounded `select 1` ping — see `docs/guides/observability.md`. (2026-10-16)
- Sentry wiring documented as the follow-the-DSN step (package not installed yet, no install allowed without owner account): `@sentry/sveltekit` + `initSentryForServer/Browser` in hooks + `captureError` forwards to `Sentry.captureException` + DSN env vars + source-map upload. Exact steps: `docs/guides/observability.md`.
## Needs doing
- Owner: create Sentry account/project, install `@sentry/sveltekit`, set DSN env, wire per docs/guides/observability.md.
- Owner: point external uptime monitor at `/api/health` with the 5-minute outage alert per docs/guides/observability.md.
- Sentry-class error tracking with recurring-bug grouping + external uptime monitor + structured JSON logging; alerts page a human without fatigue.
