# 186 — Async work has no queue — failures logged and dropped
Status: open
Source: production-readiness operations audit, 2026-10-16.
## Done
- No queue dependency (`postgres`, `@vercel/blob`, resend, web-push only); email/push/migration/rateLimit failures are logged and dropped with no retry/backoff/DLQ (`notifications.ts:27`, `pushService.ts:113-119`, `migrations/runner.ts:47-48`).
- Cron is Vercel Cron weekly 04:00 Mon with a `CRON_SECRET` bearer guard (`cron/cleanup/+server.ts:26-34`) — no race at 1/week but no resilience.
- In-memory rate limiter is per-instance by its own docs (`rateLimit.ts:1-4`) — Redis swap needed before horizontal scale.
## Needs doing
- Redis-class queue with backoff + DLQ for email/push; idempotency on the cron; Redis-backed limiter before scaling out.
