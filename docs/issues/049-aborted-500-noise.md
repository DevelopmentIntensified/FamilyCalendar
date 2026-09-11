# 049 — Auto-filed "aborted" 500s are client aborts, not bugs

Status: open

## Done

- Filed from bug export 2026-09-10: `[Tasks] [auto-filed 500] aborted (/api/tasks/4kjp83tvw1s4jj8)`, `[Calendar] [auto-filed 500] aborted (/calendar/setUserDefaultTimeZone)`.

## Needs doing

- `buildAutoBugReport` (`src/lib/server/services/autoBugReport.ts`) + `handleError` (`src/hooks.server.ts:136`) + `apiError.ts` file anything with non-empty message — including `AbortError: aborted` / fetch-cancelled navigations and the fire-and-forget `fetch('/calendar/setUserDefaultTimeZone')` in `(calendar)/calendar/+layout.svelte:35` (no keepalive/abort handling).
- Fix: skip abort-family messages in `buildAutoBugReport` (match `/abort/i`: "aborted", "aborterror", "the operation was aborted", "fetch aborted", "body used already"? no — aborts only) + return null; extend `autoBugReport.test.ts` table. Optionally: make setUserDefaultTimeZone fire-and-forget use `keepalive: true` + catch abort silently.
- Cleanup: close the two "aborted" reports as invalid once filter lands.
- Per slice: vitest + oxlint + prettier + build green, push test immediately.
