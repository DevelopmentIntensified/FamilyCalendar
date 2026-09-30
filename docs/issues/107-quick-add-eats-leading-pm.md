# 107 — Quick-add eats a leading "PM" from an event title

Status: open

Source: found by running the end-to-end suite for the first time, 2026-09-30.
`e2e/events/NlpTimeParsing.test.ts` is the only test that covers this input.

**Blocked by:** None (can start immediately).

## The finding

Quick-add is given a real-world line copied off a listing:

> `PM Certification 4 Days Classroom Training in Lynchburg, VA Tue, May 26 • 9:00 AM
> Lynchburg, VA From $1,659.95`

The date, the start time and the location all parse correctly. The title comes
back as **`Certification 4 Days Classroom Training in`** — the leading `PM` has
been consumed.

The cause is almost certainly that a bare `PM` with no hour in front of it is
read as a meridiem and stripped, leaving the title one word short and starting
mid-phrase. The `in` dangling at the end is a second symptom: the location
stripping took `Lynchburg, VA` but left the preposition behind.

**This is not a regression from this session** — the parser was last touched on
2026-09-10 and the failing spec on 2026-08-31. The 433-test unit suite passes,
because **no unit phrase test uses a title that begins with a bare meridiem.**
That is the real gap: an end-to-end test found an input class the unit suite has
never represented.

## Needs doing

- [ ] A bare `AM`/`PM` with no preceding hour is **not** a time. It is text.
      Confirm that is the rule before changing anything — the parser may have a
      deliberate reason, and if so, record it.
- [ ] A title may legitimately begin with a meridiem-looking token. Stripping it
      silently produces a wrong title with no error, which is the worst failure
      mode for quick-add.
- [ ] **Table-driven phrase coverage**, per the repo's NLP rule. Add the whole
      class, not just this string: a title starting with `AM`, with `PM`, with
      a number then a meridiem, and one where the meridiem is genuinely part of
      a time that must still parse.
- [ ] Look at the trailing `in`. If location stripping leaves the preposition,
      that is the same bug wearing a different hat, and fixing only the `PM`
      would leave it.
- [ ] The existing e2e assertion should pass on the fixed parser. Do not weaken
      it to match the bug — it is currently the only guard.

## Done

## Notes

- Quick-add's promise is that a pasted sentence becomes the right event. A title
  that silently loses its first word is worse than a refusal, because the user
  has no signal that anything went wrong.
- Found while running the suite against a real database for the first time, which
  is the argument for keeping it in the default run rather than treating e2e as
  optional.