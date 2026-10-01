# 125 — Port the approved day pages into the app

Status: in-progress

Source: #123, owner directive 2026-09-30.

**Blocked by:** None. Owns `/calendar/stats`, `/calendar/archive`,
`/calendar/account` exclusively.

## The three approved pages

`stats.html` · `archive.html` · `account.html`

## The prior work

- **#073** shipped the alerts grouping — not in scope here, but `account.html`
  is the surface the ad consent control lives on.
- **#088/#088b** replaced two sources of ad truth with one
  (`userSettings.showAdsAsEvents`, default false) and added an append-only
  consent *record*. The prototype does not show the consent control, so the
  prototype is behind the app here — the difference goes the other way.
- **#093/#094** were filed from cycle 1's marks and are still **open**:
  - *stats*: remove the "why this page can exist" card, move Recently
    Completed above the totals, make the two boxes on that row the same
    measured height.
  - *archive*: the month card padding in the archived list.
- The account page also owns **#105** (one section list) and **#102** (the
  child-account warning up front) — both filed from cycle 1, both open.

## Path note — the stated boundary was wrong

The lane was described as `src/routes/(calendar)/stats/**`,
`.../archive/**`, `.../account/**`. Only `account/` is there. The stats and
archive routes live one level deeper, under the calendar tree:

- `src/routes/(calendar)/calendar/stats/`
- `src/routes/(calendar)/calendar/archive/`

Work was done on the real files, because the alternative was doing nothing
about two of the three pages. **No route was moved** — the URLs are unchanged,
and the two navbar links (`NavbarProfileMenu.svelte:64,71`,
`NavbarMobileMenu.svelte:47,52`) still resolve.

## Needs doing

- [x] **Close #093 and #094.** They are approved-page marks on open tickets and
      this is the directive to build.
- [x] **Close #105 and #102 while the account page is open, or record
      explicitly that they are deferred and why.**
- [x] **Stats is a real question, not a layout.** Answered below. The answer is
      *no, not today* — with the evidence and the one change that would flip it.
- [x] **The "why this page can exist" card is prototype-only.** Recorded below,
      with a test, so the next reviewer marking it a third time is answered by
      a file rather than by a triage decision.
- [x] Test per closed mark, so the difference cannot recur.

## Done

### #093 — stats layout: CLOSED

All three marks.

**1. The justification card. It never existed in the app.** `stats.html:13`
says so on its own face: *"That card was cut at review ('remove this'); the
claim survives one line under the title and, in full, on tasks.html and
models.html."* The prototype no longer renders it either. There is nothing to
delete, so the mark is closed by **a test rather than by an edit**:
`stats/page.svelte.test.ts` asserts the rendered page contains no
"why this page can exist" copy and no `taskCompletions` table name, on both a
populated and an empty history. That test is the answer to a third marking.
This is the #121 failure mode, pre-empted.

**2. Recently completed above the totals. Done.** The recent list moved into
row one beside the streak hero, so it sits directly above the totals row at
every width. Grid flow, not a hardcoded row number.

**3. Equal measured height. Done, and MEASURED — not eyeballed.**

This needed a real port, not a class change. The mark describes a totals box
shorter than its neighbour; the app's totals were three separate counters in a
row of their own, all with identical copy, so they would have been equal for
the wrong reason. The approved page's shape is one totals card *in the same
row as* the two assignment lists. That is what is built, so the three boxes
genuinely differ in content and equal height is the grid's doing.

`e2e/calendar/StatsPage.test.ts` seeds **five distinct** assigners (one helper
assigning five tasks groups into a single row and would prove nothing), reads
`getBoundingClientRect().height` off all three at 1280×900, logs the numbers,
and fails if the spread exceeds 0.5px. Measured:

```
093 measured row heights (1280x900): [
  { label: 'Totals',                height: 206, rows: 0 },  <- three figures, no list
  { label: 'Assigned you the most', height: 206, rows: 5 },
  { label: 'You assign the most',   height: 206, rows: 1 }   <- empty state
]
```

Spread: **0px**. The totals box has no list in it and its neighbour has five
rows, so this is the grid stretching, not two similar boxes coinciding.

The bounds were not touched: `limit(365)` on the streak read and `limit(10)`
on the recent list are unchanged, because #093 says not to lift a cap to make
boxes match.

### #094 — archive month card padding: CLOSED

**The mark could not be read against the app, because the app had no month
card.** The archived list was a flat `space-y-3` run of event cards with no
grouping at all, so there was nothing carrying a month header to give padding
to. Building the grouping is therefore part of closing the mark, not extra
work.

The approved page's list is grouped by year-month; that is now what the app
renders — one card per month, named, counted, events beneath it, newest month
first. Both the month card and the event cards take their internal padding
from **one exported token**, `ARCHIVE_CARD_PADDING` in
`src/lib/components/archive/archiveMonths.ts`, so they cannot drift apart
again. `e2e/calendar/ArchivePage.test.ts` seeds events across two months past
the free tier's 30-day look-back, reads the rendered `paddingTop/Right/
Bottom/Left` off both cards, logs them, and asserts the month card is at least
as padded as the cards it heads on every side. Measured:

```
094 measured card padding: {
  month: { top: 16, right: 16, bottom: 16, left: 16 },
  event: { top: 16, right: 16, bottom: 16, left: 16 }
}
```

**The truncated review note could not be recovered.** #094 asks to read the
full note before starting because it was cut off at "padding...". #121 records
that round 1's mark records were cleared from `feedback/` on 2026-09-30, so
there is nothing left to read. The note's second request, if it had one, is
therefore unaddressed and #094 should not be treated as fully discharged until
the collector checks.

**The gate was not weakened — it was made honest.** `+page.server.ts` used to
hand back a hardcoded `retentionDays: 30` on the gated branch, which the page
printed as *"Events from 30 days ago"*. A gate that misreports its own size is
not a gate. Limits are now read once, before the branch, and both windows are
shown: the look-back and the archive retention. Every number comes from
`getUserSubscriptionLimits`; the prototype's 365/730 were checked against
reality and the **default tier is 30/90**, so copying the prototype's figures
would have been the lie.

### #105 — account section list: CLOSED IN PART

**Done:**

- **Your families is a section.** `AccountFamiliesSection.svelte`. It lists
  every family with its real roster size and links into the family. The count
  is a real count — it comes from `getUserFamilyMemberships` (098), which
  folds each family's roster size into the membership query. It does not go
  through `getUserFamilyId`.
  *Side effect worth recording:* 098's notes flagged that
  `getUserFamilyId` was still this loader's last reader for the family-calendar
  list, i.e. the first-row guess was still authorising content here. That is
  gone; the loader now reads memberships and takes the oldest.
- **Dashboard modules is its own section, its own action, its own submit.**
  `AccountDashboardSection.svelte` + `saveDashboardModules`. This is the part
  077 deferred. The load-bearing part is server-side: `saveCalendarSettings`
  no longer writes `hiddenDashboardModules` **at all**, because deriving a
  hidden list from a form that has no module checkboxes marks *every* module
  hidden on *every* calendar-settings save. `updateUserSettings` is a partial
  `.set()`, so omitting the field preserves it. Both directions are pinned by
  tests.
- **The section list itself.** `accountSections.ts` declares it once; the
  sidebar renders it and the page dispatches on it, so a section cannot exist
  in the nav without a body. `families` and `dashboard` added,
  `subscription` relabelled **Plan & usage** to match what it shows. A hash
  naming a section that does not exist now falls back to the first section
  rather than rendering a blank panel.
- **The plan section keeps the usage line.** "Members per family" and
  "Families" now read `N of M` against the real limit via a new `usageLine`
  helper, and say `Unlimited` rather than inventing a ceiling out of the `999`
  sentinel. Previously the "Family Members" tile showed the **family limit**
  under a members label — the wrong number under the right heading.

**Deferred, and why:**

- **Notification settings. NOT DONE — needs a decision, not a slice.** The
  approved page's four toggles are *per-event-type*
  (task-assigned / task-completed / family-joined / AI-suggestions). The one
  persisted shape is `activeSubscriptions.notificationMethods`, typed
  `{ email: boolean; sms: boolean }` — a **channel** pair, not a row per event
  type. Grepped the whole app: the column is declared at `schema.ts:142` and
  read or written **nowhere**. So both halves fail:
  - Per-event-type preferences are a **schema change**, and every schema change
    in this repo is hand-written SQL for a human. Not this slice's call.
  - The channel pair that *is* persistable would be a section writing a
    preference nothing honours — a dead affordance, which is the exact failure
    mode this repo keeps filing tickets about.
  Building the section either way ships something that does not work. It needs
  an owner decision: add the notification dispatch that reads
  `notificationMethods`, or add the table for per-type preferences. Recorded
  rather than faked.

### #102 — child-account warning up front: DEFERRED

**Out of this lane, deliberately.** #102's surface is
`app-ui/family-members-add.html`, which in the app is
`src/routes/(family)/family/[familyId]/members/add/**` — the family subtree,
owned by the lane running #124. Nothing on the account page carries the
create-a-child flow, so there is no honest partial version of it here.

It also has no schema dependency, so it can be closed as soon as it is picked
up by the lane that owns the file. #102's own notes (which are correct, and
which whoever takes it should read first) say the copy is the whole change: no
password is set, and the only way in is a magic link to an address the parent
controls — *not* the prototype's "can never sign in", which is false.

## The stats verdict: does the page earn its existence?

**No — not on its data as it stands.** And the reason is not the layout.

The prototype's thesis is that every number on the page is a read of
`taskCompletions`, the immutable table. In the app that is true of **exactly
one number**, and the other five are table counts:

| What the page shows | What actually reads it |
|---|---|
| Week streak | `taskCompletions` — **and capped at `.limit(365)`** |
| Completed tasks | `COUNT(*)` over `tasks WHERE completed_at IS NOT NULL` |
| Recurring tasks | `COUNT(*)` over `tasks` |
| Recurring check-offs | `SUM(tasks.completion_count)` |
| Recently completed | `tasks.completedAt DESC LIMIT 10` |
| Assigned you the most | `COUNT(*)` over `tasks` grouped by creator name |
| You assign the most | `COUNT(*)` over `tasks` grouped by assignee name |

Two consequences, and both are structural rather than cosmetic:

1. **"Recently completed" is a list of tasks, not of completions.** A recurring
   task checked off fifty times appears once, on the date the recurrence cursor
   last wrote. The page's own subtitle — "Your wins" — is about completions.
2. **The one number that genuinely needs the immutable table is already
   elsewhere.** The Day Dashboard shows the same streak from the same
   `computeWeeklyStreak` over the same rows:
   `FamilyTaskBoardCard.svelte:146` renders `${weekStreak}-week streak`.

And #092 has already established a third thing: the stats page attributes a
completion to the task's **owner**, not to `taskCompletions.actorId`, so a
partner's check-off is credited to you. The dashboard already does this
correctly. So of the seven numbers, one is duplicated, one is a task count, and
one is **known-wrong**.

**What I did:** I fixed the layout and I did not delete the page. Two reasons,
and the second is the real one:

1. Deleting a page that two navbar menus link to is an owner's product call,
   not a layout ticket's.
2. Deleting it would destroy the surface #092's fix lands on. #092 makes the
   page *able* to say "done by you" — which is the thing the prototype
   believed and the app currently cannot.

**Recommendation: demote, do not delete.** The page's job has to become the
history only `taskCompletions` can produce — per-actor counts, a completion
timeline, months over months. Until #092 lands and those reads are rewritten
against `actorId`, this is a delegation counter with a streak on top, and the
honest move is to stop linking it from the navbar rather than to delete it.
**That navbar change is not mine to make** — `NavbarProfileMenu.svelte` and
`NavbarMobileMenu.svelte` are outside this lane. Naming the file and the line
for the orchestrator rather than making it.

## Notes

- `archive.html` is gated. Confirm what the gate is and that the prototype's
  retention numbers still describe reality. **Done — and the prototype's
  numbers do not describe reality.** The gate is
  `canViewArchive` → `archivedRetentionDays > 0`; the default tier is
  **30-day look-back, 90-day archive**, not the prototype's 365/730.
- The account page is where a *real* product judgement lives: what a family
  sees about other members' access. Read `CONTEXT.md` on `Family Member` and
  `Member Type` before touching it. The new Your-families section prints the
  membership **role** and keeps `memberType` on the loader payload
  deliberately unused in the card: per `CONTEXT.md` the role is the permission
  and the Member Type is a personal profile, and a settings card that rendered
  a child's Member Type next to a role would read as a permission.

## Verification

Actual output, not a summary of intent. Run 2026-09-30.

- `npx vitest run` on the nine files this slice owns — **9 files, 51 tests,
  all passing.** (First run red on every new assertion: the stats order test
  read `13 < 6`, the archive month-card tests 5/6 failing, the sidebar list
  tests 3/4 failing.)
- `npx vitest run` (whole repo) — **222 files passed, 2 failed; 2918 passed,
  5 failed.** Both failures are another lane's in-flight `resolveEventRange`
  work (`src/lib/server/services/eventRange.test.ts`,
  `src/routes/api/events/server.test.ts`). Nothing of mine.
- `npx svelte-check` — **47 errors, 42 warnings, 34 files. Zero in any file
  this slice touched.** (It read 55 while my own test fixtures were
  mistyped; #098's last recorded figure was 49.)
- `npx oxlint` on every account/archive/stats/archive-route file — **exit 0,
  no findings.** This included clearing five pre-existing findings in
  `AccountApiTokensSection.svelte`.
- `npx playwright test e2e/calendar/StatsPage.test.ts
  e2e/calendar/ArchivePage.test.ts` — **2 passed (39.0s)**, numbers above.
- `npm run build` — **green** (Vercel adapter, 30.76s).

### Two things the build fought back on, both other lanes

Worth recording because they cost real time and neither was mine:

1. `src/routes/(calendar)/calendar/import/+page.svelte.test.ts` — a test file
   named with SvelteKit's reserved `+` prefix. This fails the **whole repo's**
   build, for everyone, until it is renamed to `page.svelte.test.ts`.
2. `src/routes/(family)/family/create/+page.svelte:162` and
   `src/routes/api/notifications/+server.ts:41` were both mid-edit with
   syntax errors while this slice was running.

Separately: two agents building at once clobber `.svelte-kit/output/server`,
which surfaces as `Server files not found … did you run 'build' first?`. Not a
code fault — worth knowing before someone debugs it for an hour.

## Live defect found, not fixed — `adConsentRecords`

The account page's `saveCalendarSettings` calls
`recordAdConsentChange` (`src/lib/server/services/adConsentService.ts:44`),
which inserts into `adConsentRecords`. **That table does not exist in the
database** — the migration is hand-written SQL nobody has run. The database
has `userAdConsent`; `schema.ts:805` declares `adConsentRecords`.

The call is not wrapped, but it returns early when the setting did not change,
so today only the exact act of **toggling the ad switch for the first time**
throws, lands in the catch, and returns a 500 for the whole calendar save.
Confirmed present in the database via `information_schema.tables`.

Out of this lane (`$lib/server/services/`, and the DDL is a human's job).
**The fix is the pending migration; a belt-and-braces `catch` in the service
would hide the missing table rather than report it, so I did not add one.**