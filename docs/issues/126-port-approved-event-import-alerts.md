# 126 — Port the approved event and import pages into the app

Status: done

Source: #123, owner directive 2026-09-30.

**Blocked by:** None. Owns the event modal, `/calendar/import`, and the alerts
feed exclusively.

## The three approved pages

`event.html` · `import.html` · `notifications.html`

## The prior work

- **#073** shipped the alerts grouping — needs-you vs news, all five types
  labelled, filter chips. That is most of `notifications.html`; verify and
  close the gap rather than re-implementing.
- **#082** the calendar only loads the month it was asked for — the root cause
  of "import adds nothing in future months". **Open.**
- **#083** import preview before commit. **Open.** No batch-undo by decision.
- The event modal carries creator names, RSVP indication, and a "who's going"
  attendance summary across month/week/day/list/modal/action-sheet.

## Needs doing

- [x] **Close #082 and #083.** They are the substance of `import.html`, both
      open, and an approved page is not much of an approval if the thing it
      approved is still broken.
- [x] **Verify the event modal against the prototype** and close the gap. The
      modal is 295 lines after #039; the prototype is a picture of it. Check
      the attendance summary and creator attribution specifically — #026 put
      those on every calendar view and the prototype may or may not show them.
- [x] **`notifications.html` vs #073** — read what shipped, write down what the
      prototype shows that #073 did not do, and build the difference.
- [x] Import is a destructive-adjacent surface: it writes many events. Batch
      operations need a pending state and an undo path. `AGENTS.md` requires
      the ack, and the tickets already say no batch-undo exists — that is the
      gap.
- [x] Test per closed mark.

## Done

### #082 — the calendar only ever loads the month it was asked for

The root cause of "import adds nothing in future months" is closed on the
**server** half. `GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD` reads a range
through the same pipeline the page load uses — `getAccessibleCalendarIds` +
`eventAccessFilter` for scope (personal and family, nothing else), the same
overlap predicate, `expandEventsForUser` for recurring masters and exceptions,
then `parseEvents` / `attachRsvpStatus` / `attachAttendanceSummaries` /
`attachCreatorNames`. It is not a second dialect of the query.

- The range contract is bounded: both ends required, ISO dates only, ordered,
  and `MAX_RANGE_DAYS = 62` so one request cannot become the ±2 years the page
  load was narrowed away from. A date that does not exist (`2026-02-31`) is
  refused rather than rolled over.
- `resolveEventRange` and `MAX_RANGE_DAYS` live in
  `src/lib/server/services/eventRange.ts`, **not** in the `+server.ts`: SvelteKit
  rejects a non-handler export from `+server.ts` with "Invalid export". That
  cost one build failure and is the reason the module exists.
- The import success screen now links to the **earliest** imported date
  (`/calendar?date=…`, named in words), so an import that landed in another
  month is verifiable in one click.
- **Not done, and it is the other half of #082:** the client does not call this
  endpoint yet. Month navigation, the merge, the bounded cache and the pending
  state all live in `src/routes/(calendar)/calendar/+page.svelte` and
  `src/lib/components/calendar/calendarView.ts`, which another agent owns. The
  endpoint is unused until that wiring lands — flagging it rather than reaching
  across the boundary.

### #083 — preview before commit, plus the undo that did not exist

Preview-before-commit was already shipped and is verified, not rewritten. What
#083 recorded as a deliberate gap — **no batch-undo** — is now closed.

- **The undo path.** `?/commit` returns `importedEvents`: `{id, title,
  startIso}` per row it actually wrote (rows that failed to write are not
  claimed). The success screen posts that batch back to a new `?/undo` action.
- `planUndo` decides what may be removed. A row is deleted only when the stored
  row still carries the same title and start the import wrote. The events table
  has **no `updated_at` and no import-batch id**, so "has the user edited this
  since?" is answered by comparing what is about to be deleted against what was
  written. Edited rows are kept and named; already-deleted rows are reported as
  gone.
- Scope is (ids, `ownerId`, `calendarId`) on both the read and the delete, so a
  forged or stale batch cannot reach a row the viewer did not write there.
- Feedback follows `AGENTS.md`: `Undoing…` before the POST settles, a toast
  naming what was removed, an inline `import-undone` card naming what was kept
  and why, and a failure toast that leaves the button rather than a silent
  no-op. No `confirm()` — the success screen's own button is the ask.
- **What it cannot undo:** an event the user has edited since the import (kept
  on purpose, and named), a row already deleted, a row from an earlier import
  session (the batch lives in the action result, not the database), and any
  mirror the user created later by hand outside this path.
- 083's other open marks stand: the client preview screen now has a component
  test (checkbox defaults, select-all/none/back-to-suggested, the duplicate
  badge, and that only ticked rows are posted), and the success screen links to
  the first imported date. The `?select=1` deep link into selection mode is
  still `calendar/+page.svelte`'s to add — out of this boundary.

### The event modal vs `event.html`

Verified against the prototype, and it does **not** fully match — so this is not
the "zero marks, nothing found" outcome #123 predicted. The prototype's
attendance block leads with a **count and a proportion** (`going/total`, plus a
stacked bar); the modal showed only per-status totals. That is #106's subject
matter, so the change is deliberately the smallest thing that closes the gap
here: `EventAttendeeGroups` now leads with `N of M going` and names the split
underneath (`2 maybe · 2 awaiting · 2 guests`), so the proportion cannot imply
the unanswered are out. Guests count toward `M` — they were asked too.

Creator attribution **matches** the prototype: `Created by <name>`, family
events only, with a test that the row is absent on a personal event. Your own
RSVP is a first-class three-way action. #026's creator/RSVP chips on
month/week/day/list/action-sheet were already shipped and are untouched.

### `notifications.html` vs #073 — the difference

#073 shipped the grouping, the five labels, the filter chips, the unread
treatment, the mark-all-read feedback and the link/button rows. What the
prototype shows that #073 did **not** do is its "Never pruned" card: the feed
has no delete path at all, and "mark all read" hides the problem rather than
solving it. #073 recorded this as out of scope; it is now built.

- `deleteReadNotifications(userId)` deletes only rows already read, scoped to one
  user. Unread rows are never touched.
- The page offers **Delete read alerts**, which asks first *in the page* and
  names the count ("Delete 3 read alerts?"), then removes optimistically, toasts
  what happened, and **rolls back and says so** on failure. No `window.confirm`.
- The prototype's other two side cards are prose about the model and reachability;
  they are documentation, not features, and are not built.

## Notes

- `event.html` and `notifications.html` were approved with **zero marks** in
  cycle 1 — you looked and found nothing. So the work here is verification, and
  the honest output may be "matches". Write that down rather than padding it.
- 044 aside: the archived bills surface is out of scope; do not resurrect it.

### Verification

Actual output, run at the end of the slice:

- `npx vitest run` across all ten touched test files: **193 passed, 10 files,
  0 failed.** Per file: icsImportPreview 65, eventRange 8, api/events route 10,
  import actions 29, import page 14, notifications actions 3, notifications
  page 31, EventAttendeeGroups 7, EventModal 27.
- `npx svelte-check`: **40 errors, 42 warnings, 29 files.** Baseline before this
  slice was 43 errors / 42 warnings / 32 files, so the count **went down by 3**
  — the three were this slice's own `+server.ts` export errors. **No svelte-check
  error or warning is in a file this slice touched.** The remaining 40 are
  pre-existing and outside this boundary.
- `npx oxlint` on all 17 touched files: **0 errors.** (Four pre-existing
  warnings in `EventModal.svelte.test.ts` are unchanged from HEAD — verified by
  linting the file as it was before this slice: the same four, line-shifted.)
- `npm run build`: **green, exit 0.**

### Left for someone else

- **Wiring `GET /api/events` into the calendar.** The endpoint exists and is
  tested; nothing calls it. Month navigation, the merge into the grid, the
  bounded cache and the pending state are in `calendar/+page.svelte` and
  `calendarView.ts` — another agent's files. Until that lands, #082 is
  half-closed: the calendar still shows an empty grid for an un-loaded month.
- **`?select=1`** into the calendar's selection mode (083's remaining mark) needs
  the same `calendar/+page.svelte`.
- **`schema.ts:741`'s notification-type comment** still omits
  `'added_to_family'` (found and recorded by #073). Unfixed — `schema.ts` is
  off-limits here.
