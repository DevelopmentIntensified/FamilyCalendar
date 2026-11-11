# 189 — No data export; deletion skips logs/backups — pricing promises export

Status: done
Source: production-readiness governance audit, 2026-10-16.
## Done

- Self-service export shipped: `GET /api/account/export` (401 without session) streams one JSON doc — users minus passwordHash, settings, subscriptions, memberships + family basics, events owned/attended (+exceptions), tasks created/assigned (+tags + completion history), bills + receipt items, grocery items, notifications. Sibling members surface names-only (enforced in SELECT projection + narrowing). Account page "Export your data 👪" button in `AccountDangerSection.svelte` with immediate toast ack and outcome toasts.
- Purge map + retention windows: `docs/guides/data-retention.md` — DB tables/cascades incl. the `users.ts:53-65` erasure tx, Resend (raw `emails.send`, no contact store — purge surface is delivery logs/suppressions), Vercel logs (retention `[INFERENCE]`, no drains), Neon history window + pg_dump artifacts; post-erasure checklist. Human steps flagged: Resend console audit, confirm Vercel log retention.
- Zero user-facing export routes (only admin bug/nlp downloaders, `src/lib/admin/export.ts`); pricing page promises `Your data is always yours to export` (`pricing/+page.svelte:67`) — unpublished claim.
- Self-service deletion exists with confirmation (`account/+page.server.ts:492-510` into `users.ts:53-65`, deletes user + sessions + subscriptions) and the policy documents it (`privacy/+page.svelte:112-115`); but no evidence of purges in email-provider data, Vercel logs, or backups, and nothing addresses backup/log retention. (Retention-pruning overlap noted in #029 M5 — referenced, not duplicated.)
## Needs doing
- Ship the export workflow or fix the pricing copy now; purge map across DB + Resend + Vercel logs + backups; documented retention windows.
