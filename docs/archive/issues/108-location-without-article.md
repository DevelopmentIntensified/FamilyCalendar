# 108 — Quick-add cannot read a location that has no "the" in front of it

Status: done

Source: unmatched-phrase report, 2026-09-30 —
`running with george at snow flex on tuesday at 3pm`.

**Blocked by:** None (can start immediately).

## The finding

Quick-add is asked to place a thing at a place. The date, the time and the
attendant all parse correctly. **Only the location is broken, and it is broken
three different ways.**

Measured against the live parser:

| Phrase | Location it produces | Should be |
|---|---|---|
| `running with george at snow flex on tuesday at 3pm` | *(none)* | snow flex |
| `coffee at blue bottle on friday at 9am` | *(none)* | blue bottle |
| `meeting at the annex on monday at 2pm` | **`annex on monday at`** | annex |
| `dinner at home on thursday at 7pm` | Home | Home |

## Why

Two independent causes in the same feature.

**A place without an article is invisible.** The multi-word rule requires the
article: it matches `at` + `the` + words. So `at snow flex` and `at blue bottle`
never match at all, and the place stays in the title. The one case that works,
`at home`, works only because a separate dedicated rule handles that exact
literal. **Every other single-word place fails the same way** — `at school`,
`at the gym` may pass, `at soccer practice` does not.

**A place with an article swallows the rest of the sentence.** The same rule
captures greedily and then trims at a short list of conjunctions
(`and`, `but`, `with`, `for`, `to`, `by`, `because`, `since`). That list does
not include **`on`** or a following **`at`**, so `at the annex on monday at 2pm`
captures `annex on monday at`. This is the worse of the two failures: it produces
a confidently wrong location rather than none.

## Done

- [x] **`at <place>` works with or without the article.** One rule now covers
      both, for `at` and `in the`, so the place reads the same either way:
      `at snow flex`, `at the annex`, `at blue bottle`, `at Route 9 Park`,
      `at Room 201`, `at St. Mary's`, `in the downtown square`.
- [x] **The capture has a terminator.** A place runs from the first word after
      the preposition up to — but not including — the first word that hands
      the sentence back to schedule (`on`, `at`, `from`, `in`, `to`, `for`,
      `by`, `until`, `till`, …) or to company (`with`, `and`, `but`, `or`, …),
      or a whole weekday/month/ordinal-day token, or end of text. Max five
      words. `meeting at the annex on monday at 2pm` → `annex`, not
      `annex on monday at`. Same for `party at the annex from 6pm to 9pm`.
- [x] **The location span is stripped from the title**, preposition and article
      included. The date and the time no longer ride into the place (they are
      terminators), and the place no longer rides into the title.
- [x] **The `in the X` sibling was broken identically** and is fixed by the same
      rule — see the evidence below.
- [x] **Table-driven phrase coverage.** 106 new tests across the class:
      article (none / `the`), word count (1 / 2 / 3), name shape (lowercase /
      Proper / digit / apostrophe+dot), tail (`on <day>`, `at <time>`,
      `from <time> to <time>`, `with <person>`, `and …`, `for <n> …`,
      `next <day>`, `third <day>`), and the guards that must NOT become a place
      (a clock, a daypart, a meal, a bare article, a street address, `at home`,
      `at my <place>`, `location:`, `at LU`). Suite is 539, was 433.

## The rule, in one sentence

> A place introduced by `at` (or `in the`) runs from the first word after the
> preposition — skipping one lower-case `the` — until the first terminator, and
> is then removed from the title along with its preposition.

Two deliberate refusals, both pinned by the table, because they defer rather
than guess: an `at` whose first word is a clock, a number, a daypart, a meal or
a bare article is **not** a place (`at 2pm`, `at noon`, `at lunch`, `at the`),
and the preposition is only matched lowercase so a capital `The` stays part of
the name (`at The Olive Garden` → `The Olive Garden`, not `Olive Garden`).

## Evidence: `in the X` was broken too

Measured against the parser before the fix:

| Phrase | Before | After |
|---|---|---|
| `coffee in the park on friday` | `park on friday` | `park` |
| `meeting in the annex on monday at 2pm` | `annex on monday at` | `annex` |
| `meeting in the big red barn on monday` | `big red barn on monday` | `big red barn` |
| `walk in the neighborhood park on sunday` | `neighborhood park on sunday` | `neighborhood park` |
| `party in the annex from 6pm to 9pm` | `annex from` | `annex` |
| `shopping in the downtown square` | `downtown` | `downtown square` |

Same shape, same greedy capture, same missing terminator. It is now the same
rule as `at`.

## Other behaviour that moved (all improvements, all still green)

| Phrase | Before | After |
|---|---|---|
| `coffee at the downtown roastery` | `downtown` | `downtown roastery` |
| `coffee with john at the park friday` | `park friday` | `park` |
| `a6am run` (title) | `a6am run` | `run` |
| `gym mondya at 5pm` (title) | `gym mondya at 5pm` | `gym` |

The last two come from a second fix: the title step fell back to the raw text
whenever the stripped remainder was 3 characters or shorter, which re-injected
the very span it had just removed (`run at snow flex` → title `run at snow
flex`). Any non-empty remainder now wins; the raw fallback is reserved for a
window that was emptied completely.

## Needs doing

- [ ] Nothing outstanding for this ticket.

## One decision this ticket does not make

`running with george at snow flex` yields the title **`running with george`**
*and* the attendant `george`. The name appears twice — once extracted, once
left in the title.

That may be deliberate: "Running with George" is a perfectly good title, and
stripping it would leave "running". **I have not changed it and this ticket does
not ask you to.** If the duplication is intended, say so here so the next person
does not "fix" it.

Note what did change: the *place* is now stripped, so the title is
`running with george` rather than the old `running with george snow flex`. The
name duplication is untouched and still deliberate-or-not on the next person's
call.

## Notes

- The unmatched-phrase report is the only reason this surfaced: the parser has no
  phrase-table entry for a location without an article, so the input was
  recorded as unhandled and someone looked.
- A silently-wrong location is worse than no location. `annex on monday at` will
  render on a map card and the user has no reason to check it.
- Ordering matters and is now explicit: the place rule runs **after** the
  street-address rules (an address is more specific than a bare `at`) and
  **before** the compromise `places()` guess (an explicit preposition beats an
  NLP guess — the guess was truncating `the downtown roastery` to `downtown`).
  `at home`, `at my apartment`, `location:`, `at LU` and street addresses keep
  their dedicated rules; the new rule refuses those heads rather than stealing
  them, and defers.
- Not fixed, out of scope, noticed while probing: `gym at 5 pm` leaves
  `gym at 5` in the title (a spaced time is only half-stripped). That is a
  schedule-stripping bug, not a location bug. It behaves exactly as it did
  before this change.