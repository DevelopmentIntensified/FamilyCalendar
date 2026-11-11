# 061 — Triage + clear bug-report queue

Status: done

## Needs doing

- Blocked by #059 (so 405s get explained, not silently closed).
- Resolve the three stale parse-error 500 reports (MentionInput.svelte:96/201
  js_parse_error, AddTaskCard.svelte:350 invalid closing tag — all 2026-09-19
  during red-green deploys; current build parses clean) via /admin/bugs.
- Resolve the three 405 reports per #059's verdict.
- Roll docs/STATUS.md Open list after clearing.

## Done

- CLOSED (2026-09-25, user): stale reports verified resolved-by-build (both
  files last compiled 2026-09-19; current build parses clean). 405 batch
  handled via #059/#060 closure. Queue-clearing itself happens in
  /admin/bugs; nothing left here.
- Verification of staleness already grounded: both files' last commits land
  2026-09-19; `npm run build` green on 2026-09-24 with no compile errors.
