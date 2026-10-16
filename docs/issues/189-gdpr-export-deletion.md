# 189 — No data export; deletion skips logs/backups — pricing promises export
Status: open
Source: production-readiness governance audit, 2026-10-16.
## Done
- Zero user-facing export routes (only admin bug/nlp downloaders, `src/lib/admin/export.ts`); pricing page promises `Your data is always yours to export` (`pricing/+page.svelte:67`) — unpublished claim.
- Self-service deletion exists with confirmation (`account/+page.server.ts:492-510` into `users.ts:53-65`, deletes user + sessions + subscriptions) and the policy documents it (`privacy/+page.svelte:112-115`); but no evidence of purges in email-provider data, Vercel logs, or backups, and nothing addresses backup/log retention. (Retention-pruning overlap noted in #029 M5 — referenced, not duplicated.)
## Needs doing
- Ship the export workflow or fix the pricing copy now; purge map across DB + Resend + Vercel logs + backups; documented retention windows.
