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

- DONE (2026-09-07, storage-strip slice): bills-page wiring landed —
  title field debounces POST /api/parse-bill (300ms) and prefills
  title/amount/dueDate/category as a hint; the user confirms with
  "Add bill". recurring/frequency/interval stay client-side until #006
  and are never sent to createBill (pinned by test).
