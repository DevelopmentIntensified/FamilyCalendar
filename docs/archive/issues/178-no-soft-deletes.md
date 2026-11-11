# 178 — Everything hard-deletes — no recoverable support path
Status: open
Source: production-readiness database audit, 2026-10-16.
## Done
- Zero `deleted_at`/`deletedAt` hits in `src/lib/server/db/schema.ts` and across src.
- Destructive cascades: `users.ts:61-68` deletes users + subscriptions, `events.ts:401-403` deleteEvent, `tasks.ts:717` open-task hard delete, account self-delete `routes/(calendar)/account/+page.server.ts:504-507`.
- No support recoverability path exists for any of these.
## Needs doing
- `deleted_at` on user-facing tables + support restore, or explicit waive (239-user base). Schema change = hand-written SQL + owner confirm per #142 rules.
