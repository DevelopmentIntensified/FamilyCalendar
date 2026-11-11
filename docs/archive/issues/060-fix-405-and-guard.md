# 060 — Fix 405 POST / and add durable guard

Status: done

## Needs doing

- Blocked by #059's verdict. Most likely fix: repoint the inbound-email webhook
  to `/api/email-ingest` (user's Resend dashboard step), plus in-repo guard if
  a code-side cause is confirmed.
- Consider capturing method/path + content-type on 405/404 auto-reports so the
  next unknown-actor diagnosis needs no guessing.

## Done

- CLOSED (2026-09-25, user): folded into #059's later-retry. The fix is
  currently a USER-side step (repoint the Resend webhook to
  `/api/email-ingest`); no in-repo cause confirmed, so no guard landed.
- (was pending #059)
