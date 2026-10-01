# 114 — Two parsers for the same concepts, and they disagree

Status: open

Source: architecture review, 2026-09-30, candidate #3.

**Blocked by:** 112 first, if it lands — the shared claim layer is the natural
home for shared date resolution. Otherwise independent.

## The finding

`taskQuickAdd.ts` (client) and `naturalLanguageService.ts` (server) both parse
*"a phrase → a due date and a cadence"*. They answer differently:

| | `taskQuickAdd` | event parser | bill parser |
|---|---|---|---|
| bare month-day rollover | rolls whenever candidate ≤ now | rolls only when month ≤ now.month | — |
| `biweekly` | absent | present | — |
| every-N-unit | absent | present | — |
| `quarterly` | absent | absent | present |

**Three sets of cadence vocabulary, and two answers for `sept 1`.** Both
answers are tested. Neither test is wrong, because each tests its own parser.

The root cause is structural: `dateVocab.ts` holds **tokens only, no resolution
rules**. So every parser re-implements resolution, and they drift.

## The irony worth naming

`taskQuickAdd.ts` is a **client** module that imports **server action types** as
its vocabulary. It had no shared layer to import, so it reached across.

## Needs doing

- [ ] One resolution rule, three callers. Client and server share it.
- [ ] Decide the rollover answer for a bare month-day, once, and pin it in one
      test that all parsers satisfy. Not three tests that each assert a
      different thing.
- [ ] One cadence vocabulary. `quarterly` is a cadence; every parser should know
      it or all should not.
- [ ] The client stops importing from `$lib/server/db/actions/`. If the shared
      resolution lives in a server-only module, that is a design failure, not a
      workaround.
- [ ] Table-driven coverage of the *shared* phrases, run against all three
      parsers, so a new phrase is added once and lands everywhere.

## The deletion test

Deleting `taskQuickAdd.ts` moves nothing — the quick-add field loses its parser
and the rules land twice more. It earns its keep. But it is a **fork, not a
copy**: the client/server split is the *reason* it is split, and the
duplication is not.

## Done

## Notes

- Do not unify the *interfaces*. The three parsers should stay separately
  callable; only resolution is shared. A single mega-parser would be shallower,
  not deeper.
- 112's two-Date-implementations finding is the same defect one level down.
  Fixing 114 first is legitimate; doing both is best.
