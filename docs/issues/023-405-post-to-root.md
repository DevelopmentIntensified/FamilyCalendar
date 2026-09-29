# 023 — Auto-filed 405: POST to / with no form actions

Status: not-reproducible — awaiting Vercel log evidence

## Done (in-app triage, 2026-09-29)

- Swept every `method="POST"` in `src/` (33 sites). None of them posts to
  `/`: each either carries an explicit action (`?/resolve`, `?/purchase`,
  `?/updateFamily`, `?/setMemberType`, `?/updateRole`, `/api/logout`) or
  posts to its own route path.
- The only root-POST-shaped form in the app is the bug-report form,
  `src/routes/report-bug/+page.svelte:77-78` — `method="POST"` with
  `action="?/submit"`, i.e. it targets `/report-bug?/submit`, NOT `/`.
- No client `fetch('/')` with a mutating method anywhere in `src/`.
- Root route `src/routes/(marketing)/+page.svelte` contains no `<form>` and
  no fetch at all; the route group has no `+page.server.ts`, so `/` has no
  form actions by design — which is exactly the condition the reported
  message ("POST method not allowed. No form actions exist for this page")
  reports for a POST that originates OUTSIDE the app.
- `src/hooks.server.ts` does not rewrite or redirect POSTs to `/`.
- Conclusion: no in-repo code path produces this 405. It is consistent with
  an external caller (bot, scanner, bookmarklet, extension, or a misconfigured
  webhook) POSTing to `/`.

## Needs doing

- The only thing that can revive this is server-side evidence, which the
  codebase cannot supply. Ask for it before any code change:
  1. Vercel → project `familyplanz` → Logs, filter `path=/` and
     `method=POST` around the report's timestamp; capture the
     User-Agent / Referer / User-ID of the offending request. A crawler or
     scanner UA closes it; a Resend UA points at the inbound-email webhook.
  2. Cross-check the auto-filed report rows in `/admin/bugs` for the exact
     timestamps — the arrival pattern (a bloom, sporadic, or tied to mail
     delivery) discriminates between the hypotheses.
- If the UA is a Resend/webhook sender, the fix is user-side: repoint the
  inbound-email webhook to `/api/email-ingest` (#033). Cross-ref #059 /
  #060 — same hypothesis, unproven, "reopen on the next auto-filed 405
  batch".
- Do NOT add a 200-redirect or a catch-all POST handler for `/` on the
  strength of a guess: it would mask a real misconfiguration and the page
  still has nothing to do with a POST.

## Notes

- Kept open (not deleted) deliberately: it is an auto-filed user report, the
  verdict is "no in-app cause", and the missing piece is a log we don't hold.
