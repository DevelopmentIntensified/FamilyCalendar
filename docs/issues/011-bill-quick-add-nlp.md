# 011 — Bill quick-add NLP

Status: open

Parent: #003 Bill Tracking PRD (story 12).

## Done

- (nothing yet)

## Needs doing

- What to build: quick-add phrases with amount + due cues ("electric $120
  due friday") through the existing NLP parse pipeline; table-driven phrase
  suite covering phrasings, word orders, currency formats; existing parser
  coverage stays green.
- Acceptance criteria:
  - [ ] Exhaustive phrase table (amounts, due-dates, category hints, orders).
  - [ ] Full pipeline exercised (phrase → parsed intent → created bill).
  - [ ] Parser floor suites green; `npm run build` clean.

Blocked by: #004.
