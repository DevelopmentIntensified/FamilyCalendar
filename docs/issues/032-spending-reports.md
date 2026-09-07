# 032 — Spending reports page

Parent: #003 (story: where money is going). Split from #031 (user: "a, b and c").

Status: open

## Needs doing

- Dedicated Reports page for Spending: month-over-month trends per
  category, per-category drill-down into bills/line items, totals vs
  averages. Data source = Spend Detail (Line Item Labels when present,
  bill category otherwise) — same aggregation as the bills-page card
  (#031a) and dashboard module (#031b), so build #031 first.
- Scope guard: read-only reporting on existing data — no budgeting,
  no forecasting, no comparison-to-plan features unless asked later.
- Route: /calendar/spending (or /reports — pick per site IA at
  build time). Family bills aggregate all members; personal bills
  viewer-only, matching bill visibility rules.
