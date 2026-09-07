# 031 — Receipt item labeling + learning tag system

Status: open

Parent: #010 receipts (builds on its scan seam).

## User requirements (2026-09-07)

- Label individual receipt line items with different categories (not
  one category per receipt).
- User-level tagging that LEARNS: user corrections feed a global tag
  table so the system predicts better tags over time ("learns from the
  user how receipts should be tagged").
- Fast — and stays fast at 1000 labels.

## Design (hands-off, orchestrator assumptions recorded)

- `itemTags` table: id, `userId` (nullable — null rows are GLOBAL),
  `key` (normalized merchant or item name, lowercase trimmed),
  `category` (BILL_CATEGORIES), `weight` integer (usage count),
  `updatedAt`. Indexes: (userId, key) unique-ish, (key) for global
  lookups; category lookup is a single indexed batch.
- Learning loop (on bill save/confirm): for the merchant + each labeled
  item, upsert the USER row (weight+1, category = user's choice) AND
  the GLOBAL row (userId null, weight+1). Batched single-transaction.
- Prediction (on scan): lookup merchant key → user's own highest-weight
  row first, else global majority; item keys via one `inArray` batch.
  Two queries per scan total, indexed — O(log n) at any scale.
- Receipt UI: extracted line items each get a category select
  (suggestions = user's history first, then global top). Saving the
  bill persists items + labels + feeds the learning loop.
- Perf at 1000 labels:
  - DB: indexed key lookups — 1000 rows is trivial; no scans.
  - UI: never render 1000 nodes — suggestion list is a native
    `<datalist>` or filtered top-N (≤10) via prefix match on keystroke;
    input stays O(1) with a debounced filter.
  - Global aggregation stays read-time COUNT over indexed keys; revisit
    only past ~100k rows (materialized counters then).
- Line items stored: `receiptItems` table (billId FK, label, priceCents,
  category, position) OR JSON column on bills — implementer picks per
  house schema style; splitting a bill into multiple bills is OUT of
  scope (v1 labels items for tagging/learning; not expense splitting).
- TDD: learning loop (upsert weights, user-overrides-global), prediction
  precedence (user > global > keyword fallback), batched-query shape,
  normalization (case/punctuation), and a 1000-row perf smoke test
  (seed 1000 tags, assert query count + latency budget in the test).

## Needs doing

- Queued behind: receipts lane (#010) → privacy fixes (#029 HIGHs) →
  OCR fallback chain → this (#031) → #006 recurring bills. Same files
  as receipts (bills page, scan seam) — strictly sequential.
