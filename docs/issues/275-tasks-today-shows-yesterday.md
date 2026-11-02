# 275 — Tasks: "today" shows as yesterday (Oct 31 instead of Nov 1)

Status: done

Source: user bug-report export 2026-11-02 (website, prod www.familyplanz.com — `main` was at 0fbcc93).

## Evidence

[Tasks] "today is marking as yesterday oct 31 rather than nov 1" (2026-11-01 23:08 UTC = Nov 1 evening in US zones). Prod (main) predates #213/#214/#219 zone fixes; verify whether test already fixes it, else find the remaining UTC-day path in the tasks page.

## Done

- Root cause (prod 0fbcc93): Recurring Task cursor sync computed "today" on the SERVER's day. `cursor.ts` parsed `zonedNow(zone).toISO()` with plain `fromISO`, re-projecting into UTC (Vercel). At 23:08Z Nov 1 the server day started 00:00Z = Oct 31 19:00 CDT, so a daily cursor pinned at Oct 31 23:59 CDT (04:59Z Nov 1) was not "overdue" → never re-pinned to Nov 1 23:59 → row printed "Oct 31 · 1 day late". Secondary: the tasks loader read My Tasks in parallel with the sync, so even a correct pin showed the stale cursor until refresh.
- Already fixed on `test` by 899e7e0 (#213, `parseNow` keeps the zoned offset in `advanceCursor` / `needsOverduePin` / the 23:59 pin) and 71875fe (#235, section reads wait for the sync). Neither is on prod `main` 0fbcc93.
- Swept the rest of the tasks UI for UTC-day paths: `formatDue`, `lateChip`/`urgencyBucket` (`priorityTone`), AddTaskCard quick dates, taskQuickAdd, taskSubmit, EditTaskDialog all use the viewer's local clock on full ISO timestamps; no date-only `new Date('YYYY-MM-DD')` on a displayed due. SSR (UTC) text for a due date is repaired on hydration (`set_text`). Nothing else to fix.
- Regression tests (red → green):
  - `syncRecurringCursors.test.ts` › `Chicago Nov 1 evening, server UTC: Oct 31 cursor pins to today = Nov 1 (#275)` — fake clock 2026-11-01T23:08Z, zone America/Chicago; asserts pin = Nov 1 23:59 CDT. RED with 0fbcc93's `cursor.ts` under TZ=UTC (updateCount 0), GREEN on test under TZ=UTC and TZ=America/Chicago. Plus a "Nov 1 23:59 cursor stays put" guard.
  - `taskUrgency.test.ts` › `Nov 1 evening, cursor pinned to local end-of-day (#275)` — client half: tonight 23:59 local is `today`, no late chip, prints Nov 1; an unsynced Oct 31 cursor is "1 day late".

## Needs doing

(none) — prod gets the fix when `test` (≥ 899e7e0 + 71875fe) is promoted to `main`.
