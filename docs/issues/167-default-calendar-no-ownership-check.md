# 167 — defaultCalendarId saved with no ownership check

Status: open

Source: security audit (issue 136), 2026-10-15. Rank 7/16 — any signed-in user; today preference-only (create-form default; server POST re-validates target).

## Done

- `src/routes/(calendar)/account/+page.server.ts:174,202-219` — `defaultCalendarId` free text into `updateUserSettings`, no check against accessible calendars.
- Blast radius today is a wrong default on the create form; the event POST re-validates the target.

## Needs doing

- Validate against accessible calendars on save. One-line + test. No fork.
