# 206 — Bug-report batch: NLP phrase + mobile nav + duplicate tasks page (2026-10-25 export)

Status: open

Source: bugReports + unmatchedPhrases exports 2026-10-25 21:57 (8 open reports) + 21:58 (1 unique phrase). Related context: #204 (NLP phrase workflow, same class), #202/#205 (mobile tap-target class).

## Classes, one per unrelated work item

1. **NLP phrase (one new):** "pick up isaiah at 8:00 p.m. for swimming at the y" → matched `{"startTime":"08:00","location":"y","attendants":"[\"Isaiah\"]","title":"Pick up Isaiah p.m. for swimming","date":"2026-10-25"}`. Defects: (a) `p.m.` tokenized with periods is not matching a time rule — the `08:00` came out right but the trailing `p.m.` stayed in the title as `p.m. for swimming`; (b) second `at the y` should land as location, currently `y` landed from the FIRST `at the y` while the second `at the y` stayed unmatched/stranded; (c) title should read `Pick up Isaiah for swimming`, not carry `p.m.`.
2. **Calendar 500 (new, 1 manual report):** "Keep getting 500" — page not named, but same window as the /calendar/tasks cluster below; classify after repro. If it's the same 500 class as the auto-filed `confirmClear` ones, fold it; if it is a DIFFERENT 500 (e.g. /calendar itself, or another route), its own ticket.
3. **Tasks page broken (2 identical manual reports + 3 auto-filed 500s):** auto-filed errors all say `confirmClear is not defined` on /calendar/tasks, timestamps 2026-10-25 11:06–11:08. Same class as the `onTagFilterChange`/`confirmClear` destructure gap fixed in commit 825c095 (SSR 500). Likely all five of these are ALREADY FIXED by 825c095 (pushed same day, later that evening); verify by probing /calendar/tasks with a real session cookie and checking the timestamp of the auto-filed errors vs. the deploy.
4. **Mobile nav — can't click tasks/dashboard (1 report):** "Can't click tasks/dashboard on mobile" — likely the #202/#205 sandwich-menu / tap-target family. Check whether #202 already covers it; if a distinct defect (e.g. nav links render but taps dead), own ticket.
5. **Task description + scheduled time + time tracking synced with "taskfocus" (1 report):** feature request, not a bug. Large new surface (task descriptions, task→event scheduling, time tracking, "taskfocus" sync — external integration?). Needs owner decomposition before any work; file as feature ticket, not a bug fix in this batch.

## Needs doing

- (superseded) The five auto-filed/manual 500 reports were verified already-closed in the DB on 2026-10-25 evening: all 8 rows from the export read `status=resolved` in `bugReports` (probe + SQL, same evening), and prod probes `/calendar`, `/calendar/tasks`, `/calendar/dashboard` all return 200 with a real session cookie (the `confirmClear is not defined` class was fixed by commit 825c095's TasksMainList destructure repair). No SQL close-out needed.
- Still open: "Keep getting 500" route repro (if the reporter hits a NEW 500 after the svelte-5.57.2 deploy, it's a different bug — re-file when repro details arrive).
- Still open: mobile tasks/dashboard tap repro on device; compare against #202/#205 scope before moving to its own ticket.
- Still open: task description/scheduling/time-tracking ("taskfocus" sync) — owner decomposition before build; treat as feature ticket, not bug fix.

## Done

- (none yet)
