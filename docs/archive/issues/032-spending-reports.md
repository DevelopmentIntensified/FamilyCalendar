# 032 — Spending reports page

Parent: #003 (story: where money is going). Split from #031 (user: "a, b and c").

Status: done

## Done

- Route `/calendar/spending` (runes — matches the bills-page sibling):
  `+page.server.ts` + `+page.svelte` + colocated `page.svelte.test.ts`.
  Auth-gated like the bills page; same family/personal visibility via
  `getBillsForUser`; unconfirmed ingest drafts excluded with the same
  `(source ?? 'manual') === 'manual'` filter.
- Range: presets This month / Last month / Last 3 / Last 6 / This year /
  All time + Custom with from/to date inputs (month-bucketed; one-sided
  custom clamps to that month; custom with no dates falls back to last-6).
  Default last-6. Server-driven via `?range=&from=&to=`.
- Aggregation extensions (`spendDetail.ts`, TDD red→green, 10→38 tests):
  `presetMonthRange` (UTC month bounds per preset, year-rollover safe),
  `monthKeysBetween` (inclusive, swaps reversed bounds, rejects junk),
  `billsInMonthRange` (dated only — undated excluded from buckets),
  `spendByMonth` (one bucket per requested month, empty buckets kept so
  gaps show), `topItems` (line-item labels folded across in-range bills,
  grouped by normalizeTagKey, count + cents, inherits bill category,
  cents-desc, limit). Reuses `spendByCategory` per bucket — no duplicated
  logic. Undated bills surface as an "Undated" row only under All time.
- Load: two queries total (bills + `getItemsForBills`), everything else
  folds in memory. Payload: range/from/to, months, buckets, rangeSpend,
  undatedSpend, topItems, in-range bills for drill-down, totalBills,
  loadWarnings (guard pattern like bills).
- UI (runes, autofixer clean modulo the two #031 deviations below):
  header card (rounded-2xl border shadow-sm) with preset select + custom
  date inputs (≥44px, synced via ?range= navigation); Monthly trend table
  (categories × months, per-cell cents at text-xs, sky color intensity by
  share of the month total, totals row, overflow-x-auto inside min-w-0
  card for 320px); "Where it went" summary bars (amount + % + bill count,
  tap toggles drill-down); Undated row under All time; Top line items
  card (By total / Most often client-side re-sort); shared drill-down
  section (title, date, amount; Close clears); skeletons while the range
  navigates; empty state (bills pattern); pb-20.
- Bills page header gains a one-line "Spending" link (≥44px) — only touch
  to that file.
- e2e smoke `e2e/bills/SpendingReports.test.ts`: seeds bills via API,
  checks the bills-page link, page render, drill-down, ?range=all.
- Gates: spendDetail red→green then full vitest 1711/1712 green (the one
  failure is the pre-existing azureReceiptService timeout-test flake —
  reported, untouched); playwright e2e/bills + e2e/mobile green incl. the
  new smoke; oxlint 0/0; prettier clean; `npm run check` 0 errors;
  `npm run build` passes; svelte-autofixer run on both touched .svelte
  files. Documented deviations (same as #031): goto()/href without
  resolve() ($app/paths#resolve needs kit ≥2.26; repo pins 2.17.2) and
  writable-$state+$effect sync instead of bind-to-$derived (rejected by
  this svelte-check/svelte 5.20.1 pair).

## Needs doing

- ~~Dedicated Reports page~~ → Done (2026-09-07). Scope guard held:
  read-only reporting only — no budgeting/forecasting/comparison-to-plan.
- Deferred: paid-only spend views (spend = amounts owed in range,
  regardless of paidAt) — revisit with #006 if asked; Day Dashboard
  "Spending" module remains a possible follow-up.
