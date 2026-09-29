# 024 — @handle multi-word names fail ("name not in family")

Status: done

## Done

- Root cause (old taskQuickAdd.ts:445 `matchAtHandle`): the `@` regex
  captured one word; full-name extension only tried `First Last` and skipped
  members with no lastName — two-word first names (or name shapes not exactly
  First+Last) fell through to `unknownMember`.
- Fixed in commit `89e48b4` "fix(nlp): multi-word member names in @ handles".
- `src/lib/utils/taskQuickAdd.ts:455-482` — greedy multi-word
  `matchAtHandle`. Each member contributes a candidate set of `First Last`,
  `firstName` (may itself be multi-word) and `lastName`; a candidate may
  consume as many following words as it needs. Longest match wins; a tie
  between two DIFFERENT members returns `userId: null` (ambiguous — the caller
  surfaces "unknown member" rather than guessing) while still reporting the
  consumed length so no stray middle name is left in the title.
- `src/lib/utils/taskQuickAdd.test.ts:689` — `describe('parseTaskQuickAdd —
  @handle multi-word names (issue 024)')`, a table-driven suite over a mixed
  roster ("Mary Ann Smith" / "Mary Jones" / "Auntie May" / "Leo" / "Sam
  Rivera") plus a `TIE_ROSTER` with two members sharing the multi-word first
  name "Mary Ann": the tie surfaces unknown, and either full name disambiguates.
- `docs/STATUS.md` records it Done (entry "#024 @-handle multi-word names
  (commit 89e48b4)").

## Needs doing

- (none)
