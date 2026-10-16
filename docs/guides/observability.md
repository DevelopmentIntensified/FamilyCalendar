# Observability (issue 183)

What exists now, and the two human steps (Sentry account, external monitor) that finish it.

## What exists now

### Structured JSON logging
`src/lib/server/services/logger.ts` — `logEvent(level, event, context?)` emits a
single line of parseable JSON per call:

```json
{"ts":"2026-10-16T12:00:00.000Z","level":"info","event":"pricing_view","userId":"u1","planType":"family"}
```

- Levels: `debug` → `console.log`, `info` → `console.log`, `warn` → `console.warn`, `error` → `console.error`.
- On Vercel each line is a searchable JSON record — filter by `event`.
- Callers: `analyticsService.ts` (pricing_view, checkout_start, subscription_upgrade, waitlist_signup, ad_consent_change) and the non-prod `tasks_debug_getMyTasks` trace.
- Do NOT log request bodies — PII scrubbing is issue #169, staying separate.

### Error-capture seam
`captureError(err, ctx)` in the same module forwards errors as structured
`console.error` records (`event: "captured_error"` with `error_type`/`message`/`stack`).
This is the single function to wire Sentry into; nothing else changes.

### Health endpoint
`GET /api/health` — unauthenticated, always HTTP 200, body only
`{"ok":true,"db":"up"}` or `{"ok":false,"db":"down"}`. The db check is a
`select 1` bounded by a 1s timeout. No PII, no stack traces, no connection
details. `Cache-Control: no-store`.

Human step remaining: point an external uptime monitor at
`https://<production-host>/api/health`.

## Sentry setup (when the account/DSN exists)

@sentry/sveltekit is **not installed yet** — package installation was out of
scope for this issue (no npm installs allowed here). Exact steps for the owner:

1. Create the Sentry project (Node.js / SvelteKit SDK) and copy the DSN.
2. `npm i @sentry/sveltekit`
3. `src/hooks.server.ts` — instrumentation:
   ```ts
   import { initSentryForServer } from '@sentry/sveltekit';
   initSentryForServer(); // must run before anything else
   ```
4. `src/hooks.client.ts` — `initSentryForBrowser();`
5. `vite.config.ts`: `sentrySvelteKit({ sourceMapsUploadOptions: { org, project, authToken }, injectBuildInformation: true })` plugin (dev deps for upload).
6. In `src/lib/server/services/logger.ts`, at the top of `captureError()`:
   ```ts
   import * as Sentry from '@sentry/sveltekit';
   Sentry.captureException(err, { extra: ctx });
   // keep the structured console.error fallback after it
   ```
7. Env: `SENTRY_DSN` + (CI secrets) `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` for source-map upload. Node/edge runtime flags per Vercel integration if auto-instrumenting.
8. Alerts: route issue #183 through the Sentry project — recurring-bug grouping is automatic.

Needs: an owner-created Sentry account, project, and DSN. Do not invent a DSN.

## Uptime monitor setup

Point an external monitor (UptimeRobot, Better Stack, Checkly, etc.) at:

- URL: `https://<production-host>/api/health`
- Interval: 60s
- Expect: HTTP 200 and body containing `"ok":true`

Alerting thresholds that page without fatigue:

| Alert | Condition | Routing |
|---|---|---|
| outage | `db:"down"` (or non-200) for 5 consecutive checks (~5 minutes) | page (SMS/push/call) |
| recovery notice | health returns to `db:"up"` | notification only |
| error-rate spike | (after Sentry exists) 10× baseline `captured_error` rate over a 15m window | page to on-call channel |
| everything else (single blip, sub-minute downtime) | — | no page |

Rationale: a single failed `select 1` is not an incident; requiring 5
consecutive failures keeps a 60s cadence from paging on transient network
hiccups while still catching a real outage within minutes.
