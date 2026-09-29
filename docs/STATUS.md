# Status

Rollup of `docs/issues/`. Done mirrors the tracker's `Status: done` entries.

## Done

- #047–#052 bug + NLP export triage (DONE 2026-09-11, commits auto-report filter .. nlp-lists): #047 Add-mode mobile range-select (toolbar toggle, instant drag, touch-action none, Week/Day + tests); #048 month-only swipe-nav (`shouldSwipeNavigate` + tests, week/day pan untouched); #049 abort-family auto-file skip + tz-probe keepalive/catch; #050/#051 prod drift bundled as migrations 011–014 (auto-applies on next deploy; manual Neon SQL in issues as immediate relief); #052 multi-word with-lists + continuation title/attendant inheritance (suite 425→433).
- #053 CI gate env (DONE 2026-09-11): quality-gate passed zero env so `$env/static/private` hard-failed the build; secret-or-placeholder fallbacks for all five static names + dummy DATABASE_URL.
- #001 Local Postgres via Docker (compose, npm scripts, local env wiring)
- #004 Bill CRUD (bills table, role-gated API, minimal list UI, e2e green)
- HIGH audit fixes (2026-09-06, commits 2f2637b..fa4ef7f): bills authz/validation,
  family PII + roles + member limit, tasks assignment gate + deleteUser FK,
  events recurrence cap + delete scope + edit data-loss, signup masking
- MED/LOW audit lanes (commits 4652475..db40c05): toasts/inline confirms app-wide,
  auth autocomplete + no-reload nav, modal a11y, invites creator/admin-gated,
  bills paid/overdue UI, tasks actor attribution + undo hardening + assignee
  notify, events until off-by-one + mirror propagation + tx + offline retry
- #017 Family manage page C1 card-stack redesign (commit 409580d)
- #018 Family hub card redesign + detail grid rebalance (commit 5f8be5c)
- #019 Task scoping public/private/family — visibility column + section
  queries (a4cb9be), chips/tabs/NLP UI (ebd8b45)
- #020 Tasks page card-vocabulary restyle (commit 8d822d7)
- #021 Task settings parity: dashboard + calendar surfaces (DONE, commit
  8557796, issue flipped to `done` 2026-09-29). Dashboard
  TopPrioritiesCard pills + "→ Name" badge, calendar EventFormModal task
  mode on the shared `submitTaskQuickAdd` path, `familyId` on the calendar
  load, FamilyTaskBoardCard quick-add, TaskDetailModal pills. Only residue
  is DEFERRED: Family/Public/Private pills on the tiny calendar-grid task
  chips (DayView/WeekView/MonthDays) — too small for pill rows, e2e-text
  risk, and it collides with the calendar-view components another lane
  owns. Standalone item for a later wave.
- #022 Default calendar not respected — caller passed calendars[0] as
  defaultCalendarId, overriding user setting (calendar/+page.svelte:841)
- #024 @-handle multi-word names (DONE, commit 89e48b4; issue flipped to
  `done` 2026-09-29 after re-verification: greedy multi-word
  `matchAtHandle` in `taskQuickAdd.ts:455-482`, table suite incl. the
  ambiguous-tie case in `taskQuickAdd.test.ts:689`)
- #025 NLP parse-misses: URL fidelity, word-snap titles, street
  addresses, bare calendar routing (commit d37dab8)
- #026 Creator + going indications on all calendar views (commit 8758170)
- #027 PWA share target → smart event create with shared text (e01bc32)
- #028 Add-to-calendar: Google render link (RRULE) + .ics endpoint (31191bd)
- #026 Creator/RSVP indications: creatorName on family events (single users
  lookup, no N+1), "by <First>" chips in month/week/day/list/day-modal/action-sheet,
  "Created by" row in EventModal (uncommitted; print + dashboard deferred)
- #032 Spending reports page /calendar/spending (2026-09-07): presets +
  custom from/to range, monthly trend table (categories × months, share
  shading), per-category bars + drill-down, Undated row under All time,
  Top line items card, empty state + skeletons, bills-page "Spending"
  link; spendDetail extended (presetMonthRange, monthKeysBetween,
  billsInMonthRange, spendByMonth, topItems) — 2 queries/load, fold in
  memory
- #031 Receipt line items + labels + Tag Table + Spend Detail (2026-09-07):
  receiptItems + itemTags tables (sql/011 — NEON PENDING), tax/fees
  categories everywhere, 2-query prediction chain user → global majority,
  retraining on every save, bills API items (validated, replace-all, soft
  reconcile itemsSum/unlabeled), bills page Line Items editor (manual +
  scanned), code-only SKU name-it-once, ≤10 datalist suggestions, amber
  tax reconcile hint, Spend-by-category card (month filter + bars +
  tap-to-filter)

- #033 Digital receipt import (2026-09-07): paste-text + PDF + email
  ingest — `POST /api/parse-receipt-text` (Cerebras prompt with regex
  fallback, useCloudAI honored, 20KB cap), pdfjs-dist 5.4.149 in-browser
  text extraction (CDN worker; scans routed to OCR flow), `POST
/api/email-ingest` (svix-verified Resend webhook → draft bill from
  body text or PDF attachment), per-user `receipts.<token>@` ingest
  address on the bills page (copy/regenerate), draft lifecycle (From
  email badge, Confirm flips source → 'manual' + trains Tag Table,
  drafts never count as spend), privacy page inbound-email row, SQL
  `sql/012-receipt-import.sql` — **NEON PENDING**

- #034 Big-box receipt import (2026-09-08): `merchantProfiles.ts`
  (`detectMerchant` + per-merchant extractors for Home Depot, Lowe's,
  Walmart, Amazon) wired merchant-first into `extractReceiptRegex`
  (generic path unchanged); HD/Lowe's → housing, Walmart/Amazon → other
  (Tag Table learns specifics); 28 merchant tests + 9 category pins

- Arch audit #4 category de-dup (2026-09-08): closed vocabulary + shared
  keyword table in client-safe `src/lib/data/categories.ts` (schema
  re-exports); LIVE BUG fixed — Azure scans categorized 'tax'/'fees'
  downgraded to 'other' (receiptOcr's stale CLOUD_CATEGORIES copy);
  receiptScan + NLP keyword tables unioned (81 words, drift-guarded by
  `src/lib/data/categories.test.ts`); one shared `isBillCategory`
  (was 3 copies)

- Arch audit #5 single recurrence stepping (2026-09-08): `scheduleStep`
  exported from recurrenceService — the ONE frequency+interval stepping
  mechanism (month-end clamp table: Jan-31→Feb-28/29, Feb-29 yearly→
  Feb-28); generateOccurrence delegates (outputs unchanged, its tests the
  fence); tasks `plusInterval` + bills `plusBillInterval` delegate to it —
  cursor POLICIES (task anchors today, bill anchors stored due) stay put.
  Compounding caveat documented: clamped cursor re-anchors on the clamped
  date ("the 31st" drifts); fixing needs a stored original anchor column
  (#032/#007 adjacent).
- #035 Bill smart-parser NLP + merchant reporting (2026-09-08): merchant
  titles in parseBillQuickAdd (big-box four canonicalized, purchase
  fillers stripped, generic fallback untouched; 46-phrase table),
  bare-amount `am`-lookahead fix (`35.99 amazon` → 3599), `spendByMerchant`
  export (normalized grouping, manual-only, limit 8), spending page Top
  merchants section (top-8 table + merchant drill-down reusing the bill row)
- #039 Slim pages (DONE 2026-09-09): every oversized page/component
  split per rule (handlers stay, markup + pure logic out, colocated
  tests) — calendar/tasks 1659 → 475, family/tasks 896 → 256,
  family/[familyId] 808 → 782, account 816 → 100, EventFormModal
  1420 → 721, EventModal 1251 → 295, calendar page 919 → 682,
  members/add 499 → 121, features 586 → 273, plus shared utils
  (taskDisplay, priorityTone, bulkPlan, taskSubmit, taskEditPayload,
  familyTaskList, calendarMatch, bottomSheetSwipe, navItems, listGroup).
  Day/Week views → #046 (parity review before split). Bills EXCLUDED
  (area PAUSED).
- #041 Calendar load perf (2026-09-08, DONE): TTFB ~1.35s → shell ~0.8s
  (−40%), HTML 465KB → 147KB (−68%). #1 parallel-chain explained
  (deferred); #2 settings-via-parent; #3 month-window expansion;
  #4 batched cursor sync (A/B 1.8–3.2s → 1.2s w/ stale tasks);
  #5 verse local-only (−91 lines); streaming shell-first + skeleton;
  #6 family scope in layout; #7 MonthDays grouping bench 416→14ms;
  #8 Calendar 511→234 (Toolbar + view util, browser-verified);
  #9 tz probe once per user/browser. Playbook: docs/guides/page-perf-playbook.md.
- #038 Page-switch lag (2026-09-08): removed `{#key pathname}` + fade
  out/intro gating from all 4 group layouts (bills, calendar, family,
  marketing); `in:fade|local` first-mount only (100ms app, 150ms
  marketing, delay dropped); dead `pathname` reactivity removed.
  Build green. Server-waterfall + page-split follow-ups filed as
  Needs doing in the issue.
- #036 Bills parked as own sub-app section (2026-09-08): `/calendar/bills`
  → `/bills`, `/calendar/spending` → `/spending` under new `(bills)` route
  group (own layout + auth guard, back-to-Calendar link); 301 stubs at old
  URLs; Bills entry stripped from main nav; APIs/services/schema untouched

- Shell polish batch (2026-09-08, uncommitted): Dashboard in desktop
  logged-in nav (longest-prefix active covers /calendar/dashboard);
  calendar banner stack (offline + guest/claim share one fixed flex-col,
  `mt-10` compensation keyed on banner count via OfflineBanner
  `bind:visible`); `completed` Day Dashboard module (personal scope,
  CompletedTodayCard gated, solo kids card full-width); ListView
  EventModal gets `calendars`; mini month picker closes on
  outside-click/Escape; bell copy "Couldn't load notifications.",
  hamburger sr-only toggles; BottomNav `py-2.5` + `min-h-[52px]`,
  priority segmented buttons `px-2.5 py-1.5` without the
  `after:-inset-1.5` expander. Gates: full vitest 110 files/2070 tests
  green, e2e/navigation + e2e/mobile green, oxlint 0, svelte-check 0,
  build green. Skipped: bell-dropdown deep link to
  /calendar/notifications (NotificationBell was copy-only scope);
  ListView `familyMembers` prop (needs Calendar←page plumbing beyond
  allowed touches; EventModal defaults it to []).
- Auth consistency polish (2026-09-08, UNCOMMITTED): signup ported to
  shared AuthCard/AuthInput/ModeToggle + runes (role=group/aria-pressed/
  role=alert, SVG mail icon); skip-account copy canonical ("Start
  planning — no account needed") on login+signup, login fragment fixed;
  claim email input autocomplete + auth classes/rounded-full button;
  <Toaster/> mounted in (marketing) layout. Deferred (out of scope):
  `(calendar)/calendar/+layout.svelte` "guest calendar" banner → Anonymous
  Account/claim vocabulary.
- Calendar dead-ends + failure-feedback polish (2026-09-08, UNCOMMITTED):
  Day empty-state "Add event" (createAt); import "Import another file"
  reset + pending "Importing…" guard; checklist inline errors both
  surfaces (title kept for retry); new `endDateBeforeStart` model guard
  (End Date ≥ Start Date message + Create title/disabled reason, 4 TDD
  tests); print "Jump to now" link + fridge "9a Dentist" times; merge
  zero-count headline guard + skip two-tap confirm + split busy flags;
  notifications `added_to_family` 👪 icon + copy widened only to
  server-emitted types (no event-reply types exist — "reply to events"
  deliberately NOT added); Day/Week drag confirm() → inline banner
  (tests updated). Gates: EventFormModel 26 + Day/Week 43 green, full
  vitest 2080/2081 (only known azure timeout flake), e2e/calendar 10
  green, oxlint 0 on touched, check 0, build green. Note: touched
  DayView/WeekView .test.ts (outside lane's file list — required, they
  asserted the old confirm()).
- Charm polish batch (celebrations + copy voice, 2026-09-08, UNCOMMITTED):
  all-clear `All caught up 🎉 / Nothing open right now` block on personal
  tasks (open=0 + completed>0, filter-gated) + family/tasks (tag-gated),
  copied from family/[familyId]/tasks; empty voice (Top-3 all-clear, board
  calm 👪, kids free-afternoon, bell home-front) + deep-link CTAs (glance
  → /calendar?view=day, priorities/board → /calendar/tasks, kids →
  /family); toast voice quoted titles (tasks delete `Deleted "X"`, clear
  `… — fresh start`, Top-3 `Priority for "X" set to Y`); board streak-zero
  `Start a streak — check off today's tasks 🔥`; dashboard verse warning
  label → "today's verse" (exact-sentence banner needs a DayDashboard
  template touch — out of lane scope); calendar first-run hint points at
  ✨ Smart tasks. Tests: +7 across 5 card/bell suites (TDD red→green).

## Open

- #064–#084 prototype-review round (2026-09-28, from the app-ui + calendar-ui
  review, 18 marks over 8 prototypes; 9 pages still unreviewed):
  - Bugs found while grounding: #065 bottom nav can't reach Groceries, top nav
    can't reach Alerts (DONE 2026-09-28 — one destination list feeds both navs;
    the tab bar had its own hand-copied array *and* its own prefix-matching
    copy, which was the bug. Groceries in the tab bar as "Shop" so six tabs
    fit 320px, accessible name still "Groceries". Columns derive from the item
    count instead of a hardcoded grid-cols-5. Mobile e2e pins the geometry).
  - #064 Family links (DONE 2026-09-28): the prototype's "braces ship literally"
    claim was wrong — Svelte interpolates an attribute value, and 11 of 12 such
    links were fine. Real defects: one href built as a JS string (the family
    tasks breadcrumb, the only literal braces in the app), one href naming a
    route that does not exist (Manage invitations), and a detail page that
    rendered with a null family so five links pointed at an undefined id (now
    a 404). Guard added: links.test.ts parses the Svelte sources.
  - Calendar key (the one rebuild mark): #066 non-overlapping events still
    give up column width, #067 sponsored events unlabelled, #068 all-day vs
    timed only a fill tint, #069 no calendar filter to make "colour = calendar"
    true, #070 the key itself (blocked by 067/068/069), #071 prototype-only
    search move (the app has no search at all).
  - Approved prototypes → the real app: #072 kids' card per-child colour +
    grouped by child (DONE 2026-09-28 — child id now survives the loader, so
    the card groups and colours per child off the existing avatar palette;
    7 card tests, dashboard suites 29/29), #073 alerts grouped by needs-you vs
    news, #074 groceries restyle, #075 family-create page, #076 family-create
    members before the finish line (blocked by 075).
  - Composition marks: #077 family settings 793-line page, #078 family card
    spacing + a stat, #079 tasks page filters/inbox/row-meta, #080 verse out
    of the dashboard module band, #081 groceries card replaces parked meals.
  - The two original bug reports: #082 calendar only loads the month it was
    asked for (root cause of "import adds nothing in future months"),
    #083 import preview before commit — **no batch-undo by decision**.
  - #084 spacing pass on the 12 unreviewed prototype pages, measured not
    eyeballed, plus a permanent spacing check.
- CI workflow REMOVED (2026-09-29, user): `.github/workflows/ci.yml` is gone, so
  there is no GitHub gate on pushes to `test`/`main` or on PRs. Local
  verification is the gate now: `npm run build`, `npm run test:unit -- --run`,
  `npm run check`, `npm run proto:check`. Note for #053 — its `quality-gate`
  job no longer exists, and with it the CI-time env (`CI_PREVIEW_*` secrets)
  that #053 added, so `$env/static/private` names must exist in whatever
  environment runs the build. The `ci:secrets*` npm scripts are now orphaned:
  they only pushed secrets into GitHub Actions.
- #057 Grocery list (IN-PROGRESS 2026-09-20; re-triaged 2026-09-29). Slice 1
  (tables + migration 015 + actions + 12 tests) plus grouping, the Mine/Family
  tabs, Store Memory suggestions, optimistic check-off, the full item surface
  (edit stores / move / delete) and BOTH nav entry points
  (`navItems.ts:54` + `family/[familyId]/+page.svelte:257`) are all shipped —
  the old checkbox list in the issue was stale and is rewritten. **#074 is the
  active ticket and owns the restyle**; do not open a second groceries lane.
  Dashboard module slot is #081 (open).

- #056 Nav Calendar button dead for dashboard-default users (DONE 2026-09-12): Calendar hrefs use the `?dashboardView=1` escape hatch (desktop nav + bottom nav); active-highlight matches pathname-only; tests green, svelte-check unchanged (44 pre-existing).
- #055 Task add shows instantly (DONE 2026-09-12): optimistic `onAdded(task)` insert ahead of server list (personal + family tasks pages), `invalidateAll` stays as reconcile; component tests green, svelte-check error count unchanged (44 pre-existing).
- Tasks surfaces polish batch (UNCOMMITTED 2026-09-08): toasts on add/
  one-off complete/accept-decline, recurring single-toast on board + Top-3,
  shared `priorityTone.ts` (dot/label/due tones) across tasks page + board +
  Top-3, tag `#` glyph + placeholder, 320px dialog grid, help/placeholder
  wording, muted due/recurrence on completed rows, focus-visible + opacity-40
  hover actions.
- Bills area ARCHIVED (2026-09-25, user directive — supersedes the 09-08
  PAUSED note): whole surface `git mv`'d to `_attic/money/` per #063; build
  + suites green. DB tables and `data/categories` kept (NLP vocabulary).
  Bills tickets #003/#005–#012 and #032 closed as superseded.
- Meals area PAUSED (2026-09-08, user directive — same treatment as bills):
  `MealsCard` unmounted from the dashboard, server no longer loads meals;
  component + `/api/meals` + actions + tables parked in place (#037). Do
  NOT triage meals until unpaused.
- #059 Diagnose 405 POST / (CLOSED 2026-09-25, "tried later": in-app causes
  ruled out; Resend-webhook hypothesis unproven — reopen on next auto-filed
  405 batch, then fix is repointing the webhook to /api/email-ingest)
- #060 Fix 405 + durable guard (CLOSED 2026-09-25, folded into #059 retry;
  user-side webhook repoint, no in-repo cause confirmed)
- #061 Triage/clear bug-report queue (CLOSED 2026-09-25: stale 500s verified
  resolved-by-build; 405 batch via #059/#060; queue clears in /admin/bugs)
- #062 Per-page style reliability + compression (DONE 2026-09-24, user
  confirmed 2026-09-25: single root app.css import; per-page payload reads
  one global — admin/account unstyled pages fixed)
- #058 Task delete sync (FIXED 2026-09-24): `DELETE /api/tasks/[id]` honored
  issue-019 canMutateTask (family member could delete), `false` → 404 so
  Todoos-style external apps stop getting fake successes on delete syncs.
- #013 Tasks/family MED/LOW (**DONE 2026-09-29**, closed by the re-triage).
  8 of the original 10 shipped 2026-09-06: assignment notifications,
  remove-member un-assign, undo cursor hardening, completion actor
  attribution (sql/006), sync family scope, sub-override filter, bell
  polling, deleteUser status reset. 3 of the 5 residue bullets were also
  already shipped or moot: bulk `applied: ownedIds.length` (now
  `applyPerItem` with per-item try/catch and a real count), unresolvable
  invite stored as a raw-id guest name (now `resolveEventInvites` drops an
  unknown member id rather than degrading it to a guest), and
  `canUploadAttachment` — the bullet was factually wrong, it IS called from
  `checkSubscriptionAction`; the gate it wanted is moot anyway (receipts are
  process-and-delete, bills archived). The 2 real survivors were SPLIT to the
  issues that own them: stats completion attribution → **#092**, exception
  upsert race → **#014**. Neither was dropped.
- #092 Calendar stats credit completions to the wrong person (NEW 2026-09-29,
  split from #013). The stats page filters task completions by the Task's
  OWNER, not by who completed it, so a partner checking off your task credits
  you. The actor column exists and the dashboard already does this correctly;
  this is the one query that was never updated. Small, self-contained, and the
  number is quietly wrong rather than missing.
- #014 Events/calendar MED/LOW (OPEN, 3 items; re-triaged 2026-09-29 —
  7 of the 9 bullets are already shipped and are struck from the issue:
  date-only `recurringUntil` inclusive end-of-day, family-mirror origin id +
  propagation + transactional delete, multi-day split in the user zone,
  offline 401/403 retry-instead-of-discard, scope-'this' attendee note,
  master-edit exception-key shift, duplicate carrying reminderMinutes +
  attendees, and the create/update/invites/mirror transaction). 3 OPEN:
  (1) recurring DST drift — needs an ADR in `docs/adr/` before any change;
  (2) single-occurrence Exception Overrides still don't propagate to the
  family-calendar mirror (a scoping decision, not just code);
  (3) **moved in from #013** — the exception upsert is select-then-write and
  `event_exceptions` has no unique index on (event_id, original_date), so
  concurrent single-occurrence edits insert duplicates. Needs a duplicate
  sweep before the index, hand-written SQL, and coordination with #086.
- #015 App UX MED/LOW (re-triaged 2026-09-29: **14 of ~15 items are already
  shipped**, verified against code). Toasts wired app-wide across 6 surfaces
  with success *and* failure branches; all 7 `window.confirm()` sites replaced
  by the inline pattern (`ExitSelectionAsk` + calendar bulk-bar confirm);
  family actions render `form.error`; auth forms have `autocomplete` +
  `inputmode` and no `location.reload()` left anywhere; 4 copy-link sites with
  feedback + fallback; DayActionSheet and DayEventsModal both have
  `role="dialog"` + focus trap + Escape; NotificationBell has a retry row; the
  `?edit=` dead-end and the meals label are fixed. **Only 4 items remain**, each
  one session and disjoint: 44px touch targets in the hour grids (steppers are
  ~24px), delete/clear-completed have no pending state (double-tap = double
  DELETE), the edit-task dialog is not scrollable, and the event modal's
  attendee region has no skeleton. Do NOT put this in a fleet lane.
- #016 Security LOWs (deferred)
- #023 405 POST to `/` (NOT REPRODUCIBLE 2026-09-29 — awaiting Vercel log
  evidence; kept, not deleted). All 33 `method="POST"` sites in `src/` were
  swept: none targets `/`. The only root-shaped form is the bug-report form
  at `?/submit`; no client `fetch('/')` mutation exists; `/` has no
  `+page.server.ts` and therefore no form actions by design — which is
  exactly what the reported message says about a POST arriving from outside
  the app. Next action is evidence, not code: Vercel logs filtered to
  `path=/ method=POST` at the report timestamp, for User-Agent. Cross-ref
  #059/#060 (unproven Resend-webhook hypothesis).
- #029 Privacy audit (OPEN — the M3/M4/LOWs + M5 retention). H3/M1/M2
  shipped 2026-09-07; H1/H2/M6 and EXIF stripping are void by the
  2026-09-07 process-and-delete decree. M5 sharpened 2026-09-29: it is the
  SAME gap as the existing weekly cron (`vercel.json` → `/api/cron/cleanup`,
  `src/routes/api/cron/cleanup/+server.ts:10-31`), which prunes only stale
  anonymous users (90d) and expired claim tokens. `notifications`, resolved
  `unmatchedPhrases`, `bugReports` and `adEvents` grow unbounded. Extend
  `runCleanup()` rather than build new infra; suggested windows 180d for
  resolved `unmatchedPhrases`/`bugReports`, 90d for read `notifications`.
- #040 Console `reportAllChanges` TypeError (BLOCKED — awaiting reporter,
  re-verified 2026-09-29: still zero hits in `src/`, in `node_modules/svelte`
  and in `node_modules/luxon`; `VM1054` is Chrome's eval/extension-injection
  label and our own chunks would show real filenames). Next action is to ask
  the reporter: does it repro with extensions off / in another browser, what
  extensions, which view, visually broken or console-only, which URL. It
  revives as a real bug only if it repros extension-free, or a stack resolves
  to our own filenames. No code change until then.
- #085–#091 technical-debt sweep (filed 2026-09-29, from a pass over schema,
  migrations and half-wired code). None is started; all `Status: open`.
  - #086 **No migration baseline** — the load-bearing one. 21 of 39 declared
    tables are created by nothing in `sql/migrations/`, and the runner fails on
    migration 001 (its first statement is an `ALTER TABLE "userSettings"`) so
    every later migration is skipped on an empty database. `003` disagrees with
    the schema on 8 tables (worst: `waitlist` has `email` as primary key in 003
    and an `id` key in the schema; `aiUsageTracking` and `adEvents` are
    effectively different tables). `tasks` is created twice, 9 columns vs 16.
    Step 1 is a manual schema dump the user must run — we cannot pick a winner
    between `003` and the `drizzle/` copies until we see the real databases
    (same trap as #050).
  - #087 Archived money subsystem is still advertised — the changelog, the
    **privacy policy** and the roadmap all describe scan-receipts / mark-bills-
    paid / receipt-email ingest as live. The policy names a processor we never
    call, which is the serious half. `bills`/`receiptItems`/`itemTags` are
    declared and migrated with zero readers.
  - #088 Ad consent has two sources of truth, and the one read at serve time can
    never gain a row (its only writer has no callers), so ads never render at
    all. Two of the three booleans are read and written nowhere.
  - #089 Waitlist duplicate guard can never fire — `onConflictDoNothing()` with
    no unique index on email, so the "already on the waitlist" branch is dead
    and duplicates insert. Also unthrottled while every other public write uses
    the shared limiter, and it stamps consent on a non-consenting submission.
  - #090 `groups`/`userGroups`/`familyGroups` declared, joined, never used. Only
    live reference is two e2e cleanup helpers. Blocked by #086.
  - #091 Family invite link is only findable by knowing where to look — no share
    sheet, no invite-by-link on the family page, no code-link email template,
    and a non-admin sees an empty page. (The 404 premise was stale; #064 fixed
    it. The rest stands.)
  - Not filed: the retention/pruning gap folds into #029's M5, and the
    half-wired Meals surface is #081's territory and stays parked per the
    2026-09-08 user directive.
