# 167 — defaultCalendarId saved with no ownership check

Status: done

Source: security audit (issue 136), 2026-10-15. Rank 7/16 — any signed-in user; today preference-only (create-form default; server POST re-validates target).

## Done

- `src/routes/(calendar)/account/+page.server.ts:174,202-219` — `defaultCalendarId` free text into `updateUserSettings`, no check against accessible calendars.
- Blast radius today is a wrong default on the create form; the event POST re-validates the target.
- FIXED 2026-10-22 — `saveCalendarSettings` now calls `getAccessibleCalendarIds(userId)` (calendarScope, same helper as the event POST) when a default is posted; foreign/nonexistent id → `fail(400, 'Selected default calendar is not available')`, no write. Tests red→green in `page.server.test.ts` (4 new: foreign reject, nonexistent reject, personal accept, family-shared accept). Existing updateEmail suite green.
