# 277 — /calendar/tasks 500: confirmClear is not defined

Status: done

Source: user bug-report export 2026-11-02 (website, prod www.familyplanz.com — `main` was at 0fbcc93).

## Evidence

[auto-filed 500] "confirmClear is not defined" on /calendar/tasks (2026-10-28). 825c095 (2026-10-22) destructured confirmClear in TasksMainList; report is after that, so verify a remaining reference path on main vs test.

## Done

- Root cause: 03df161 (2026-10-22, #200 bind removal) replaced `confirmClear = $bindable()` in `TasksMainList.svelte`'s `$props()` destructure with nothing — the key stayed in `interface Props`, so svelte-check was silent, but `{#if confirmClear}` read an undeclared identifier → ReferenceError during SSR whenever the list had ≥1 completed task. Correction to the Evidence line: 825c095 restored only `onChipChange/onSortByChange/onSearchQueryChange/onTagFilterChange`, NOT `confirmClear`. The fix is 645722a (2026-10-23), which added `confirmClear,` to the destructure.
- Already fixed: 645722a is in prod `main` 0fbcc93 and in `test`. Swept every `.svelte` under `src/` (current `test`) for Props keys missing from their `$props()` destructure: none. `+page.svelte` (legacy mode) declares `let confirmClear = false` and passes `{confirmClear}`; no other reference. The 2026-10-28 report most likely came from a deploy/client bundle predating 645722a reaching prod (exact deploy timing not verifiable from git).
- Regression tests (red → green):
  - `src/routes/(calendar)/calendar/tasks/page.ssr.test.ts` — server-build render (`svelte/server`) of the tasks `+page.svelte` with realistic page data (open, daily recurring, accepted family assignment, completed task, pending + requested assignments, roster, Chicago zone), a degraded empty-load render, and `TasksMainList` SSR in the clear-completed idle / confirm / in-flight states. With `confirmClear,` removed from the destructure: 4/5 RED with `ReferenceError: confirmClear is not defined` (the prod message); restored: 5/5 GREEN under TZ=UTC and TZ=America/Chicago.
  - `src/lib/components/propsDestructure.test.ts` — class gate: scans every `.svelte` in `src/` and fails on any `interface Props` key missing from its `$props()` destructure (self-test reproduces the 03df161 shape → `['confirmClear']`). GREEN on current tree.

## Needs doing

(none)
