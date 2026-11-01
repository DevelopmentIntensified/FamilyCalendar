# 263 — LocationSearch: aborted request clears the newer controller (stale suggestions)

Status: open

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`LocationSearch.svelte` `searchLocations` `finally { abortController = null }` unconditionally.

## Repro

Fast typing -> stale suggestions overwrite fresh ones.

## Done

(none yet)

## Needs doing

- Only null if `abortController === thisController`.
- Red test first where a seam exists (`tdd`).
