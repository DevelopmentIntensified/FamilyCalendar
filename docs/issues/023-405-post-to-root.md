# 023 — Auto-filed 405: POST to / with no form actions

Status: open

## Needs doing

- Auto-filed report: "POST method not allowed. No form actions exist for
  this page" at `/`.
- Likely stale client/service or a form posting to root. Low priority —
  investigate who POSTs to `/` (check Vercel logs if possible, or the
  report-bug page's form action), decide whether to 200-redirect or
  ignore.
