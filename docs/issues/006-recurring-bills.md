# 006 — Recurring bills

Status: done

Parent: #003 Bill Tracking PRD (story 3).

## Done

- Schema: `bills.frequency` (text) + `bills.interval` (int) — `sql/013-recurring-bills.sql`,
  applied to both local Docker DBs (familycalendar + familycalendar_test).
- Canonical model: one row per bill; `dueDate` doubles as the cursor. Recurrence is
  virtual-expansion-at-read, never materialized.
- Stored frequency vocabulary: `daily | weekly | monthly | yearly` + interval 1..365.
  The event-parser's `biweekly` / `every_N_units` tokens arrive pre-mapped to
  frequency + interval via `naturalLanguageService.recurrenceToSchedule`; raw parser
  tokens are rejected (400) at the API.
- Cursor: `computeNextBillDue` / `advanceBillCursor` (actions/bills.ts) — mark-paid
  advances dueDate by the smallest n×interval landing strictly AFTER today, anchored
  on the OLD dueDate (unlike tasks, which anchor on today and pin overdue). Paying
  early keeps cadence; paying late skips missed periods. No dueDate → first
  occurrence one interval out from today.
- Documented asymmetry: unmark-paid does NOT rewind the cursor. One-off bills
  unchanged by mark-paid.
- Actions: `CreateBillInput` + `BillPatch` carry `frequency`/`interval`; `parseRecurrence`
  validates `recurring: {frequency, interval} | null` (null clears = one-off).
- API: POST/PUT `/api/bills` accept `recurring`; invalid → 400 before any write.
- UI (bills page, runes): parse-bill prefill flows into the create form as an
  editable "⟳ Repeats" schedule chip (frequency select + interval, suggested badge);
  detail expansion shows "Repeats every N <unit> — next due <date>"; mark-paid toast
  names the next due date; list rows carry a ⟳ recurring pill.
- Integration: bills + spending pages read `dueDate` — recurring bills appear once at
  the cursor due; no query changes needed.
- Tests: parseRecurrence table, computeNextBillDue cursor table, POST/PUT API shapes
  (400-before-write, cursor advance, no-rewind), page chip/detail/toast tests, e2e
  `BillsCrud` recurring create + mark-paid-advances-due-date flow (mirrors the
  RecurringEvents regression spec). Full vitest green except two pre-existing flakes
  (azureReceiptService timeout test; NLP "tuesday and thrusday" test is
  run-date-sensitive — file untouched by this issue).
