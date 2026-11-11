# 109 — "Which Dashboard Modules are visible" has five shapes, and two already disagree

Status: done

Source: architecture review, 2026-09-30, candidate #4 — ranked top because it is
the only candidate where the seam is *already wrong in production*.

**Blocked by:** None.

## The finding

`CONTEXT.md` says the Daily Verse renders on the calendar "and/or" the
dashboard. So the visibility of the verse is a function of **two persisted
facts**: the Dashboard Module switch, and the Daily Verse setting on the
calendar.

`verseIsVisible` was written to read both. **The calendar loader never calls
it.**

```\nHide the verse in /account → the verse still renders on /calendar.
No error. No test fails. The user is told one thing and shown another.\n```

Nothing in the interface told the calendar loader a second fact existed.

## Five shapes of one question

| Site | What it actually does |
|---|---|
| dashboard loader | canonical read **plus** a locally invented rollup, `board \|\| kids` |
| calendar loader | ignores `modules.verse` entirely |
| family page | reads two fields, never composes them |
| `DayDashboard` | absent means visible |
| account loader | inverts checkboxes, writes two places |

Five sites, one question, no shared answer.

## Needs doing

- [ ] **Fix the live bug first, on its own.** The calendar loader must consult
      the same visibility answer the dashboard does. A test that hides the verse
      and asserts it is absent from `/calendar`'s payload — that test must fail
      before the fix and pass after.
- [ ] **Design the read, do not just factor the `&&`.** The current shape answers
      "and these two booleans". Callers actually ask *"for this viewer, which
      modules are visible, and which expensive family reads can I skip?"* The
      second half is the leverage: it should be able to tell a loader not to
      fetch at all.
- [ ] One function, one return, every site derives from it. The `board || kids`
      rollup stops being a private detail of the dashboard loader.
- [ ] `DayDashboard`'s absent-means-visible default becomes the module's stated
      behaviour rather than a coincidence of what was passed in.
- [ ] Table-driven tests: viewer × module × persisted-fact combination, covering
      the "one says hide, the other says show" case explicitly, since that is
      where the bug lived.

## The deletion test

Deleting the composition moves a ten-line `&&` into three loaders. It **moves**
rather than concentrates. That is what makes it shallow as currently shaped, and
what this ticket is for.

## Done

- **The live bug, fixed and pinned.** `calendar/+page.server.ts` now asks the
  shared answer instead of reading `showDailyVerse` alone, so a verse hidden in
  /account no longer renders on /calendar. New suite
  `src/routes/(calendar)/calendar/page.server.test.ts` drives the real loader
  (scripted drizzle stub) over the two facts × six combinations, including the
  reported one and its mirror, and asserts the verse read never runs when it is
  hidden. Watched it fail on the reported row before the fix.
- **One function, one return.** `dashboardVisibility({ settings,
  familySwitches })` in `$lib/dashboardModules.ts` returns
  `{ modules, shows(id), needs(read) }`. It is pure, so the loader, the page
  payload and the component all share it. `composeModuleVisibility` and
  `verseIsVisible` are gone — two names for the same answer is how the bug
  survived. The composition moved out of `db/actions/` into the vocabulary file
  it depends on; that file now only reads rows.
- **It tells a loader what it can skip.** A `DashboardRead` vocabulary
  (`verse`, `familyTasks`, `familyRoster`, `familyDayEvents`,
  `kidsAttendance`, `groceries`) is declared per module in `DASHBOARD_READS`.
  The dashboard loader's private `board || kids` rollup is gone; each leg asks
  `needs(read)`. Two reads are now skipped that were not before: Kids'
  Schedule alone no longer buys `getTasksForFamily`, and a viewer with neither
  Day at a Glance nor Kids' Schedule no longer buys `getFamilyDayEvents`.
- **`settings` is one argument**, not two fields, so a caller cannot pass the
  setting and forget the list — the shape of the original defect.
- **`DayDashboard`'s absent-means-visible is now stated, not incidental**:
  `showsModule()` in the module file, with tests for "no map at all", "no entry"
  and "explicit false".
- Family page and /account deliberately untouched (see Notes).

## Notes

- Fixing the bug and deepening the seam are separable. If the deep version turns
  out to be a fight, land the bug fix and close the ticket with a note. Do not
  let the live defect wait on the refactor.
- `hiddenDashboardModules` currently holds one stale id for the removed Member
  Strip. It is inert and pinned by tests. Leave it; it is not this ticket.
- **The family page was left alone.** It reads the two *raw* facts on purpose:
  an admin row has to say "off for everyone" apart from "you hid this", and that
  is `moduleRowState`'s three-way question, not a visibility boolean. Handing it
  a composed map would add a field nothing reads.
- **/account was left alone.** It writes the persisted facts; what it persists
  and the shape of `hiddenDashboardModules` are unchanged, as the ticket
  requires. It has no visibility question to ask.
- `npm run build` green; `npx svelte-check` 49 errors, none in the files this
  ticket touched (two were, and are fixed; the rest is the pre-existing set,
  now including 2 in `src/lib/utils/taskUrgency.test.ts` from concurrent work).
- `prettier --check` also flags files nobody touched (`server/utils/guard.ts`,
  `DashboardInfoBand.svelte`), so the tree is not prettier-clean and this ticket
  did not reformat it. `oxlint` is clean on every file here except one
  pre-existing `no-known-value-widening` at `dashboard/+page.server.ts:58`
  (`toGroceryCardItem`), which this ticket does not touch.
