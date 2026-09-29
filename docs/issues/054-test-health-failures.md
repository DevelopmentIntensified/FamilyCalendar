# 054 — Test-health: 6 failing on test branch (pre-existing)

Status: in-progress

## Done

- Triaged 2026-09-11 full-suite run (2318 passed, 6 failed). All six fail
  WITHOUT any of the 047–053 / 046 changes in the loop (verified: touched
  files don't intersect, EventFormModal tests mock fetch so the NLP
  rewrite can't reach them).
- **All 6 scoped reds closed — two by commit `3b35652` (2026-09-25), one by
  archival.** Re-verified 2026-09-29; nothing was left to fix.
- `naturalLanguageService.test.ts` "friday and saturday dinner" — **test was
  wrong, parser was right.** Pinned rule: every bare weekday resolves
  STRICTLY AFTER today, then the pair sorts ascending, so list order flips
  depending on run day. Was hardcoding `dates[0] = Friday`, which breaks
  when today IS Friday (`nearestWeekday` skips a week). Fixed by deriving the
  expectation from the same rule at
  `naturalLanguageService.test.ts:1179-1198` (`strictlyNext(weekday)` helper,
  with a weekday sanity assertion). No parser change → no phrase table needed.
  - **Fuzz-proven**: re-ran the single test with the clock pinned via
    `vi.setSystemTime` to Fri `2026-10-02` and Sat `2026-10-03` — green both.
    Probe reverted, `git diff` on the file is empty.
- `EventFormModal.svelte.test.ts` ×4 (NLP visibility block) — **component was
  wrong, test expectations were right.** Root cause: the Show-More reveal was a
  legacy `$: hasDetectedFields && !showMore` watcher. `form` is a runes-class
  instance whose identity never changes, so the `$:` block had no tracked
  dependency and never re-ran — the pane never opened after a parse. Moved the
  reveal to the parse site (`parseNlInput`) where the detection actually
  happens: `EventFormModal.svelte:250-262` (deleted the dead watcher at
  `:217-224`). Only one test assertion changed, and only because the behaviour
  is now better than what it asserted (pane auto-opens, so the test no longer
  needs to click "show more" first): `EventFormModal.svelte.test.ts:348`.
- `azureReceiptService.test.ts` — **no longer a red; nothing to fix.** The
  money surface was `git mv`'d to `_attic/money/` in `a8e6280` (2026-09-25,
  #063), two weeks AFTER the 2026-09-11 triage. It is dead code: the vitest
  workspace includes `src/**` from the repo root (`vite.config.ts:36`), so
  `npx vitest run _attic/money/.../azureReceiptService.test.ts` exits 1 with
  "No test files found". Reported, not repaired — per instruction, archived
  code is not fixed. (It *is* timing-sensitive if ever restored: `pollTimeoutMs: 5`
  / `pollIntervalMs: 1` at line 164-176.)

## Needs doing

- ~~**New red, outside this slice's scope**~~ — **fixed by the orchestrator
  2026-09-29, test expectation was stale.** `page.svelte.test.ts:117` expected
  `href="/family/fam1/invitations"`; the component renders `/family/invitations`
  because invitations is ONE route, not per-family — exactly the correction
  #064 made, and pinned by `links.test.ts:191-193`. The test was asserting the
  pre-064 shape. Expectation corrected, 9/9 green.
- `EventFormModel.svelte.ts` still emits
  `state_referenced_locally` (svelte compile, `EventFormModel.svelte.ts:179`).
  It was the misleading symptom behind the #2 diagnosis — the watcher really
  did never fire — but the warning itself is unrelated dead-warning debt near
  `initializeCalendar()`. No test covers it. Cheap cleanup, not done here.
- Transient reds seen during a concurrent-agent run, all green on rerun — no
  action, but they mean a full-suite count is only trustworthy when the
  worktree is quiet:
  - `src/lib/server/services/icsImportPreview.test.ts` — "Failed to load
    url ./icsImportPreview"; the file was being written mid-run.
  - `src/routes/(family)/family/[familyId]/links.test.ts` — took 20049ms.
    Green standalone (63/63 with icsImportPreview).
- Keep the fence green. Per slice: red-green, oxlint + prettier + build green,
  push test.

## Verification

```
npx vitest run src/lib/server/services/naturalLanguageService.test.ts
  -> 433 passed (433)

npx vitest run src/lib/components/calendar/EventFormModal.svelte.test.ts --project=client
  -> 53 passed (53)

npx vitest run src/lib/server/services/naturalLanguageService.test.ts -t "friday and saturday dinner"
  -> 1 passed | 432 skipped  (clock pinned Fri 2026-10-02, then Sat 2026-10-03)

npx vitest run _attic/money/src/lib/server/services/azureReceiptService.test.ts
  -> No test files found (exit 1) — archived, out of the workspace include

npx vitest run --project=server   -> 1560 passed | 1 failed (transient, above)
npx vitest run --project=client   -> 349 passed  | 1 failed ((family) page, above)

npx vitest run --project=client "src/routes/(family)/family/[familyId]/page.svelte.test.ts"
  -> 9 passed (9)   (after the stale expectation was corrected)
```
