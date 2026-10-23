# 204 — Event NLP: four unmatched phrases (2026-10-22 export)

Status: open

Source: unmatchedPhrases export 2026-10-22 20:12 (4 unique). All go through `naturalLanguageService.ts` / `parseEventInput`. Related live context: #107 fixed the bare leading-PM class today — same file, separate defects.

## The defects, one per phrase, each owner-confirmed live

- "lrc goes to yoder's at 6:30pm" → matched `{"startTime":"18:00","title":"LRC goes to Yoder's at 6","date":"2026-10-22"}`. Two defects: (a) `6:30pm` did not match a time rule at all — the bare `18:00` means an unrelated later hour won — leaving `at 6` stranded in the title; (b) `goes to yoder's` should produce location `Yoder's` (person/place after "goes to"), so the whole thing should parse as a place/event time, not a `at 6`-looking title.
- "remind me that i can take my books out of the freezer in 48hrs" → matched `{"title":"Remind me that I can take my books out of the"}` — title truncated mid-sentence at "the", date stuck at parse-day, and the `in 48hrs` relative-duration clause is IGNORED. `remind me …` intent (bullet task/reminder semantics is its own sub-decision; at minimum the temporal clause must land: `date=+48h`, full sentence preserved as the title).
- "fall festival at ccl 6-8pm oct 30" → matched `{"date":"2026-10-30","startTime":"20:00","location":"CCL","title":"Fall festival 6-"}`. Range-time `6-8pm` (and `6-8 pm`, `6-8pm`) never parsed; the END hour `8pm` won as the start time. Title carries a dangling `6-` (plus no range start).
- "november 16th start date at cloudfit" → matched `{"date":"2026-11-16","title":"start date at cloudfit"}`. Date + title both landed, so why unmatched: the leading bare-date phrase de-football rule in claim-guards (#112) writes `November 16th` ahead, and then `start date at` can never be decided whether "start date" is a claimable time word or a claimable title prefix and the leftover `at cloudfit` should have become location. Parser currently SILENTLY claims a stray `at cloudfit` into title, not location. Fix is: title = `Start date`, location = `Cloudfit`, no stray at-word orphan.
- (Matching-note, not a defect to fix here: "out of the freezer" loses `freezer` because `out of the` overlaps with the yesterday-style bounds — per #112's claim-guard work the phrase must not sacrifice full-sentence title.)

## Needs doing

- TDD in `naturalLanguageService.test.ts` (repo NLP rule): table-driven suite for each of the 4, covering as many colloquial variants + word orders as feasible: `6-8pm | 6 to 8pm | from 6pm until 8pm | 6-8 pm | 6–8pm (en dash)`; `in 48hrs | in 48 hrs | in 2 days | in 90 minutes`; `goes to/goes over to/heading to`+`; possessive apostrophe-s Yoder's/Yoders; `start date at X | starts on Nov 16 at Cloudfit`; `remind me that|to …`.
- RED first on all four exact phrases; each defect gets its own normalized expectation so a single rule fix cannot mask the other three.
- GREEN minimal in naturalLanguageService.ts: (1) range-time rule (start=first hour in range, end=last; meridiem attaches to the end hour and back-extends, and range hours where no explicit `am/pm` in first) (2) relative-duration rule `in <n><unit>`/`<n><unit> + now` (also push `remind me` semantics: leave the phrase as title; only the time resolution should change). (3) `goes to <place>` location rule (mirroring the `at <place>` shared-resolution work in #114). (4) `start date at Cloudfit` claim-split: the `at`-phrase owns location even with a title prefix that POSTdate is grounded on 16th. Keep the whole-sentence title rule intact.
- Never regress: #107's leading-PM suite, #110's #908 433–539 suite and #112 claim-guards all still green post-fix.
- If a rule collides with an existing one (hour rewriting, place fallback), prefer the narrower rule, and rerun ALL suites before green call. Escalate to owner if any defect requires changing the shape of an allowed claim rather than adding runs.
