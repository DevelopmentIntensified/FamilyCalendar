# Status

Rollup of `docs/issues/`. Done mirrors the tracker's `Status: done` entries.

## Done

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
- #021 Task settings parity: dashboard + calendar surfaces (commit 8557796)
- #022 Default calendar not respected — caller passed calendars[0] as
  defaultCalendarId, overriding user setting (calendar/+page.svelte:841)
- #024 @-handle multi-word names (commit 89e48b4)
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

- Tasks surfaces polish batch (UNCOMMITTED 2026-09-08): toasts on add/
  one-off complete/accept-decline, recurring single-toast on board + Top-3,
  shared `priorityTone.ts` (dot/label/due tones) across tasks page + board +
  Top-3, tag `#` glyph + placeholder, 320px dialog grid, help/placeholder
  wording, muted due/recurrence on completed rows, focus-visible + opacity-40
  hover actions.
- Bills area PAUSED (2026-09-08, user directive): the parked `/bills` +
  `/spending` sub-app must NOT be triaged or checked for issues until the
  user unpauses it. Open bills items below (#003/#005/#007–#010, word-
  preservation correction) are frozen, not actionable.
- Meals area PAUSED (2026-09-08, user directive — same treatment as bills):
  `MealsCard` unmounted from the dashboard, server no longer loads meals;
  component + `/api/meals` + actions + tables parked in place (#037). Do
  NOT triage meals until unpaused.
- #003 Bill Tracking PRD (parent; slices #005–#011 pending)
- #005 Bill calendar overlay (blocked by #004 — #004 done, so startable)
- #006 Recurring bills (2026-09-08): frequency + interval on bills,
  `sql/013-recurring-bills.sql` (**LOCAL ONLY — NEON PENDING**), dueDate cursor
  advanced by mark-paid (strictly-after-today, anchored on old due), unmark no
  rewind, API `recurring` shape + 400s, bills-page ⟳ chip/pill/toast, e2e flow
- #007 Paid cursor (blocked by #006)
- #008 Monthly Burn card (blocked by #006)
- #009 Due-soon reminders (blocked by #006)
- #010 Bill receipts (in progress: OCR chain + process-and-delete landed;
  opt-in Azure cloud step landed — scan chain complete)
- #011 Bill quick-add NLP (blocked by #004 — startable)
- #012 Bills MED/LOW follow-ups
- #032 Spending reports page
- #013 Tasks/family MED/LOW (8 of 10 audit items fixed 2026-09-06: assignment
  notifications, remove-member un-assign, undo cursor hardening, completion
  actor attribution (sql/006), sync family scope, sub-override filter,
  bell polling, deleteUser status reset; bulk-events item deferred to events
  lane)
- #014 Events/calendar MED/LOW
- #015 App UX MED/LOW
- #016 Security LOWs (deferred)
