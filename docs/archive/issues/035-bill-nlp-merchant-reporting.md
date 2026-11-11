# 035 — Bill smart-parser NLP + merchant reporting

Status: done

## Done

- `/api/parse-bill` quick-add prefill (amount/due-date/recurrence).
- `/calendar/spending` page (presets, trend table, top items).
- Bill NLP merchant titles (#035): big-box four canonicalized (Home Depot,
  Lowe's, Walmart, Amazon); purchase fillers (receipt/order/invoice, + bill
  next to a known merchant) stripped; unknown merchants keep their words.
  Bare-amount guard fixed so `35.99 amazon` reads 3599 (the `am`-lookahead
  no longer eats the `am` of amazon). 46-phrase table
  (naturalLanguageService.test.ts, merchant block) incl. due/recurrence combos.
- `spendByMerchant` in spendDetail service (title lower/trim grouping,
  first-seen display, manual-only, blank titles skipped, cents-desc, limit 8)
  - table tests (grouping, normalization, in-range, drafts, limit).
- Spending page Top merchants section (top-8 table from in-range bills,
  tap-to-expand merchant bills reusing the drill-down row) + tests.
- Smart-parser phrase coverage note: this file.

## Needs doing

- (none)

## Contract note (2026-09-08)

- Bill titles preserve user words: title = input minus ONLY consumed
  structural spans (#tag match, due-date span, recurrence span, amount
  span) → collapse whitespace → trim trailing punctuation → merchant
  in-place canonical substitution. No stop-word trimming, no filler
  dropping. E.g. "walmart receipt 120" → "Walmart receipt",
  "order paint from home depot 45" → "order paint from Home Depot",
  "saturday home depot 45" → "saturday Home Depot" (bare weekday is not
  a due span without a cue word). 16-phrase preservation table in
  naturalLanguageService.test.ts; BILL_TITLE_STOP /
  BILL_MERCHANT_FILLER deleted.
