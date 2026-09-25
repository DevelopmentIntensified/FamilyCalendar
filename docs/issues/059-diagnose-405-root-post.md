# 059 — Diagnose 405 POST / (auto-filed reports)

Status: done

## Needs doing

- Three auto-filed `[auto-filed 405] POST method not allowed. No form actions
  exist for this page` reports with `page: /` (2026-09-21 03:32, 2026-09-24
  14:42). The landing page has no form actions and no app surface POSTs to `/`
  (checked: landing markup, manifest share_target → GET /calendar,
  NotificationBell → /api/notifications, hooks MUTATING_METHODS).
- Leading hypothesis: the Resend inbound-email webhook is pointed at `/`
  instead of `/api/email-ingest` (#033 notes the webhook URL handover was a
  user step); sporadic timing matches mail arrival. Verify against the Resend
  dashboard/logs (needs the user's Resend access) and any request logs.
- Record the verdict (source + evidence) in this file.

## Done

- CLOSED (2026-09-25, user): "can be tried later." Verdict still unproven —
  the Resend-dashboard evidence never gathered; web send-bloom 405s likely
  whenever the webhook spams `/`. Reopen on the next auto-filed 405 batch for
  one-pass verify + repoint.
- Ruled out in-app causes: no `method="POST"` form, no JS fetch, no service
  worker POST targeting `/`; share-target is GET /calendar.
