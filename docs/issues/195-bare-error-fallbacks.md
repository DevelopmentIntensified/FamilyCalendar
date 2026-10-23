# 195 — Bare Something went wrong fallbacks (usability #9)
Status: done
Source: ui-design-principles audit (usability #9), 2026-10-16. Bug — fix without asking per the skill.
## Done
- `EventFormModal.svelte:380,388,429,479` and `EventModal.svelte:256,295` fall back to `Something went wrong. Try again.` when the server returns no message — no what (creating vs saving vs duplicating; VPN/auth vs field error), no next step.
- `src/lib/utils/actionError.ts` `actionErrorCopy(action, serverMessage, status)`: server message verbatim when present; otherwise what (create/save/duplicate/delete) + next step per status — 401/403 sign-in, 5xx/no status connection+VPN recheck, other 4xx recheck the fields.
- All six sites wired (create POST, multi-create, edit PUT in EventFormModal; delete, duplicate in EventModal). TDD: util table + site-level tests in both suites.
