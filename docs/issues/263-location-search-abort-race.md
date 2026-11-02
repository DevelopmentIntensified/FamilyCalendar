# 263 — LocationSearch: aborted request clears the newer controller (stale suggestions)

Status: done

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`LocationSearch.svelte` `searchLocations` `finally { abortController = null }` unconditionally.

## Repro

Fast typing -> stale suggestions overwrite fresh ones.

## Done

- `LocationSearch.svelte` `searchLocations`: per-request `const controller`; `finally` only resets `loading`/`abortController` when `abortController === controller`; results (and error-clears) from an aborted request are dropped.
- Red-green: new `src/lib/components/LocationSearch.svelte.test.ts` (abort-aware fetch double, fake timers: 3 rapid queries -> request 2 is aborted by 3, stale "Maine" never shown after fresh "Main St").

## Needs doing

(none)
