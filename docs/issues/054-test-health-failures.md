# 054 — Test-health: 6 failing on test branch (pre-existing)

Status: open

## Done

- Triaged 2026-09-11 full-suite run (2318 passed, 6 failed). All six fail
  WITHOUT any of the 047–053 / 046 changes in the loop (verified: touched
  files don't intersect, EventFormModal tests mock fetch so the NLP
  rewrite can't reach them).

## Needs doing

- `naturalLanguageService.test.ts` — "friday and saturday dinner" expects
  dates[0] = Friday; fails when run on a Friday/Saturday (nearestWeekday
  rolls past today). Make the test day-relative instead of weekday-fixed.
- `EventFormModal.svelte.test.ts` ×4 (NLP visibility block: date inline,
  green checkmark, hide-on-change, start/end inputs) — modal never shows
  the detected field even with fetch mocked. Suspect EventFormModel
  `state_referenced_locally` warning (build log) or debounce wiring.
- `azureReceiptService.test.ts` — "throws a plain timeout error when the
  operation never completes" (timing-sensitive; rerun to confirm flake).
- Keep the fence green: these are the only reds; everything else 2318 green.
- Per slice: red-green, oxlint + prettier + build green, push test.
