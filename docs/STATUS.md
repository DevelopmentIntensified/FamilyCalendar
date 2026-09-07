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

## Open

- #003 Bill Tracking PRD (parent; slices #005–#011 pending)
- #005 Bill calendar overlay (blocked by #004 — #004 done, so startable)
- #006 Recurring bills (blocked by #004 — startable)
- #007 Paid cursor (blocked by #006)
- #008 Monthly Burn card (blocked by #006)
- #009 Due-soon reminders (blocked by #006)
- #010 Bill receipts (in progress: OCR chain + process-and-delete landed;
  opt-in Azure cloud step landed — scan chain complete)
- #011 Bill quick-add NLP (blocked by #004 — startable)
- #012 Bills MED/LOW follow-ups
- #013 Tasks/family MED/LOW (8 of 10 audit items fixed 2026-09-06: assignment
  notifications, remove-member un-assign, undo cursor hardening, completion
  actor attribution (sql/006), sync family scope, sub-override filter,
  bell polling, deleteUser status reset; bulk-events item deferred to events
  lane)
- #014 Events/calendar MED/LOW
- #015 App UX MED/LOW
- #016 Security LOWs (deferred)
