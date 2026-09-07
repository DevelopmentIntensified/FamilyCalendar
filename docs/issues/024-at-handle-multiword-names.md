# 024 — @handle multi-word names fail ("name not in family")

Status: open

## Needs doing

- User report: `@` with a two-word name errors "name not in family".
- Root cause (taskQuickAdd.ts:445 matchAtHandle): `@` regex captures one
  word; full-name extension only tries `First Last` and skips members
  with no lastName — two-word first names (or name shapes not exactly
  First+Last) fall through to unknownMember.
- Fix (TDD, exhaustive table): greedy extension — after `@`, match
  against each member's display name (firstName alone, lastName alone,
  First Last, multi-word first names) consuming as many following words
  as needed; longest match wins; exact ties = ambiguous (surface error);
  unknown still surfaces. Blocked until #021 lane lands (owns the file).
