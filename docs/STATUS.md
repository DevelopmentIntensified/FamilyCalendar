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
- #036 Bills parked as own sub-app section (2026-09-08): `/calendar/bills`
  → `/bills`, `/calendar/spending` → `/spending` under new `(bills)` route
  group (own layout + auth guard, back-to-Calendar link); 301 stubs at old
  URLs; Bills entry stripped from main nav; APIs/services/schema untouched

## Open

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
