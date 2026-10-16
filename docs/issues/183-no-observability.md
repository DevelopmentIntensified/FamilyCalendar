# 183 — No error tracking, no uptime, free-text logs
Status: open
Source: production-readiness operations audit, 2026-10-16. Before-money blocker.
## Done
- Zero Sentry/uptime/latency/alerting anywhere (`package.json` has no observability package; grep finds only `console.*`). No way to detect an outage or page a human.
- Logging is free-text/interpolation (`[KPI]` lines `analyticsService.ts:44-61`; `tasks.ts:349-353` dumps JSON.stringify to a debug log) — not structured/searchable as emitted. PII scrub already tracked in #169 (referenced, not duplicated).
## Needs doing
- Sentry-class error tracking with recurring-bug grouping + external uptime monitor + structured JSON logging; alerts page a human without fatigue.
