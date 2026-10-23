# 107 — Quick-add eats a leading "PM" from an event title

Status: done

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

- Fixed 2026-10-22 (TDD red→green; no commit per instruction).
- **Rule confirmed, not changed:** the time matcher (`naturalLanguageService.ts`
  ~:1229–1267) requires a digit before am/pm; a bare `AM`/`PM` with no preceding hour
  is **not a time — it is text**. That rule stands. The title loss did not come from
  the time rules at all: the leading `PM` was eaten by the TITLE_STOP edge-trimming in
  `cleanTitleText`, and the trailing stray digits ("Pack meeting 10") came from the
  pre-window trailing strip (`\s+(?:…|am|pm)$`) eating "10 am"'s own meridiem so the
  whole-time cosmetic strip missed the bare hour.
- Parser fix, three small edits in `naturalLanguageService.ts`:
  1. `isLeadingMeridiem` in `cleanTitleText` — a title may open with a bare am/pm
     token; kept when it is the FIRST token (position-based: the same token can also
     be last and must still drop there).
  2. `'in'` added to TITLE_STOP so a window ending in the location preposition
     ("…Training in") drops it.
  3. The pre-window trailing strip gained `in` and a `(?<!\d)` lookbehind so an
     hour's own meridiem reaches the whole-time cosmetic strip.
- Table suite `Bare leading meridiem stays title text (issue 107)` in
  `naturalLanguageService.test.ts` — 11 tests: ticket line (title/location/time +
  dynamic next-occurrence-of-May-26 date), leading `AM` / `P.M.` / `pm` / `PM` forms, meridiem
  after the title text, mixed with explicit times, number-then-meridiem still
  parsing, trailing bare pm rejected as a time.
- Integration cases in `src/routes/api/parse-event/server.test.ts` (regex path through
  the real `POST /api/parse-event` seam, LLM faked off): the ticket line plus
  `pm dentist monday 3 pm`.
- Evidence: red 8/11 failed → green 11/11; targeted server run 554/554; whole
  server-project run 2761 pass / 10 fail — all 10 are `*.real.test.ts` Postgres-seam
  tests failing on "db down" (no local DB up; pre-existing, unrelated files).
- Existing e2e `e2e/events/NlpTimeParsing.test.ts` run green, unmodified: 1 passed.
- Fixed title for the ticket line: `PM Certification 4 Days Classroom Training`
  (leading PM restored, dangling `in` gone). Location stays `Lynchburg` — the e2e
  pins `toBe('Lynchburg')`, and the ticket's claim that "the location stripping took
  Lynchburg, VA" was inaccurate: the `, VA` never reached the location (the
  compromise-place fallback grabbed the first token). Upgrading the fallback to
  `City, ST` would widen location rules and require an e2e change; left as-is.
- The trailing `in`: location stripping does NOT leave the preposition — the 50-char
  title window cut landed after `in` because `Lynchburg` sits outside the resulting
  window. The `in` stop-word addition resolves the trailing case in the window it
  appears in; deep pre-window location blanking (state-suffix into the location, tail
  shifting) is the bigger redesign and is deliberately not done here.

## Notes

- Quick-add's promise is that a pasted sentence becomes the right event. A title
  that silently loses its first word is worse than a refusal, because the user
  has no signal that anything went wrong.
- Found while running the suite against a real database for the first time, which
  is the argument for keeping it in the default run rather than treating e2e as
  optional.