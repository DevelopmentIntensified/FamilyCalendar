# 204 — Event NLP: four unmatched phrases (2026-10-22 export)

Status: done

Source: unmatchedPhrases export 2026-10-22 20:12 (4 unique). All go through `naturalLanguageService.ts` / `parseEventInput`. Related live context: #107 fixed the bare leading-PM class today — same file, separate defects.

## The defects, one per phrase, each owner-confirmed live

- "lrc goes to yoder's at 6:30pm" → matched `{"startTime":"18:00","title":"LRC goes to Yoder's at 6","date":"2026-10-22"}`. Two defects: (a) `6:30pm` did not match a time rule at all — the bare `18:00` means an unrelated later hour won — leaving `at 6` stranded in the title; (b) `goes to yoder's` should produce location `Yoder's` (person/place after "goes to"), so the whole thing should parse as a place/event time, not a `at 6`-looking title.
- "remind me that i can take my books out of the freezer in 48hrs" → matched `{"title":"Remind me that I can take my books out of the"}` — title truncated mid-sentence at "the", date stuck at parse-day, and the `in 48hrs` relative-duration clause is IGNORED. `remind me …` intent (bullet task/reminder semantics is its own sub-decision; at minimum the temporal clause must land: `date=+48h`, full sentence preserved as the title).
- "fall festival at ccl 6-8pm oct 30" → matched `{"date":"2026-10-30","startTime":"20:00","location":"CCL","title":"Fall festival 6-"}`. Range-time `6-8pm` (and `6-8 pm`, `6-8pm`) never parsed; the END hour `8pm` won as the start time. Title carries a dangling `6-` (plus no range start).
- "november 16th start date at cloudfit" → matched `{"date":"2026-11-16","title":"start date at cloudfit"}`. Date + title both landed, so why unmatched: the leading bare-date phrase de-football rule in claim-guards (#112) writes `November 16th` ahead, and then `start date at` can never be decided whether "start date" is a claimable time word or a claimable title prefix and the leftover `at cloudfit` should have become location. Parser currently SILENTLY claims a stray `at cloudfit` into title, not location. Fix is: title = `Start date`, location = `Cloudfit`, no stray at-word orphan.
- (Matching-note, not a defect to fix here: "out of the freezer" loses `freezer` because `out of the` overlaps with the yesterday-style bounds — per #112's claim-guard work the phrase must not sacrifice full-sentence title.)

## Done

GREEN 2026-10-22, TDD (26 new table-driven tests in
`naturalLanguageService.test.ts` — RED was 19 fail / 7 pass; the 7 pre-green
rows are pins and the defect-4 exact phrase, already fixed by today's #107
work). Suites: naturalLanguageService 577/577, parserClaimGuards 6/6,
dateResolution.parsers 159/159, dateResolution 101/101, taskQuickAdd 141/141,
bulkAiService 63/63, eventRecurrence 12/12.

- Exact-phrase outputs after the fix:
  - `"lrc goes to yoder's at 6:30pm"` → title `lrc`, location `yoder's`,
    date parse-day, startTime `18:30`, endTime undefined.
  - `"remind me that i can take my books out of the freezer in 48hrs"` →
    date +48h, startTime +48h wall clock, title = full sentence
    `remind me that i can take my books out of the freezer`.
  - `"fall festival at ccl 6-8pm oct 30"` → title `fall festival`,
    location `ccl`, date `oct 30`, startTime `18:00`, endTime `20:00`.
  - `"november 16th start date at cloudfit"` → title `start date`,
    location `cloudfit`, date `nov 16` (the exact phrase already parsed
    right post-#107; the `title-prefix … at cloudfit` word order with a
    trailing abbreviated date still gobbled `cloudfit nov 16` — fixed).
- Rules (all in `naturalLanguageService.ts`):
  1. `bareRangeMatch` — bare hour range `6-8pm | 6-8 pm | 6 to 8pm |
     6–8pm`: end carries the meridiem (required, so bare digit ranges
     like "20-30 pages" never fire), start back-extends it,
     `applyPeriod` on both. Runs after the from/short/between range
     rules, guarded `!foundTime`. Span strips from the title.
  2. `relativeDurationMatch` (`in <n> minutes|mins|min|hours|hrs|hr`,
     glued or spaced) — lands date AND wall-clock startTime (`now +
     n units`), span stripped; day/week/month stays with the existing
     `relativeMatch` (guarded `!result.date`, so "in 2 days" unchanged).
     "Remind me" semantic decision: only time resolution changes — the
     full sentence survives as the title (below).
  3. `matchGoPlacePhrase` — `goes to | goes over to | heading to +
     <place>` reads the same `readPlacePhrase` grammar as the #114
     `at <place>` rule; article forms ("goes to the range") stay title
     text because the first-word blocklist rejects them. Narrowed to
     the movement verbs only; plain "go to"/"going to" deliberately
     not claimed.
  4. `PLACE_TIME_GUARD` in `readPlacePhrase` — a mid-place word that is
     clock data (colon time, meridiem hour, hour range incl. "to")
     ends the place name ("at ccl 6-8pm" is ccl, "goes to aunt ruth's
     4:45pm" is aunt ruth's). Bare numbers still allowed mid-place
     ("Room 201", "Route 9 partir" style untouched).
  - Supporting: `TITLE_TIME_RES` gained an "at H[:MM][ap]m" whole-span
    strip (put first) — fixes the stranded "at 6" leftover ("dinner at
    6:30pm at the park" → "dinner"); the colon rule now eats a trailing
    meridiem ("4:45pm" no longer leaves "4"); `PLACE_CALENDAR_WORD`
    adds month abbreviations (jan…dec, sept) so "at cloudfit nov 16"
    stops in the right place; "remind me"-led relative spans reuse the
    full-sentence title path (never 50-char truncated).
- Not done here (ticket note, not blocked): the "out of the freezer"
  loses-`freezer` note vanished once the relative span strips — freezer
  rides whole in the title, matching note; "remind me" task vs event
  semantics remain a separate sub-decision.
