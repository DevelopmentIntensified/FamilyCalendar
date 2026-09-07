# 011 — Bill quick-add NLP

Status: done

Parent: #003 Bill Tracking PRD (story 12).

## Done

- `parseBillQuickAdd(input, zone?)` in `src/lib/server/services/naturalLanguageService.ts`:
  due cues → recurrence → amount → title (sequential stripping, event-parser
  style, so bare numbers can never eat a date span). Returns `ParsedBill`:
  title, amount (dollars), amountCents (integer cents, int4-guarded), dueDate
  (YYYY-MM-DD, zone-resolved), recurring (event-parser value vocabulary:
  daily|weekly|biweekly|monthly|yearly|every_N_units), frequency + interval
  (structured, ready for the bills recurrence columns in #006), category
  (#tag wins → merchant keywords → other), confidence.
- New route `POST /api/parse-bill` (`src/routes/api/parse-bill/+server.ts`):
  local deterministic regex only — no paid LLM, no rate-limit ceiling.
  400 on blank/non-string input; relative dues resolve in the user's zone.
- 114 table-driven phrase tests in `naturalLanguageService.test.ts` (amounts,
  due dates, recurrence, categories, titles, word order, zone, robustness) +
  3 route tests (`src/routes/api/parse-bill/server.test.ts`). Parser floor
  (220 pre-existing tests) green. Full suite green except the parallel
  receipts lane's in-flight issue-010 failures (reported, not touched).

## Needs doing

- Bills-page wiring (prefill from parsed intent) — rolled into the
  receipts/privacy-fix slice that owns the bills page; commit edd5195
  carries the parser + route. Limitations: single-currency ($ only),
  no by-day lists (bills anchor on dueDate), no fuzzy weekday
  correction, deterministic-only (no LLM path).
