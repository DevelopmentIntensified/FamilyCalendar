# 239 — Groceries mutations have no network-error handling (stuck busy state)

Status: open

Source: repo bug audit 2026-11-01 (lane D).

## Evidence

`src/routes/(calendar)/calendar/groceries/+page.svelte` `check`/`uncheck`/`setColour`/`saveStores`/`move`/`remove` bare awaits; `colourBusy`/`busyId` stuck on throw.

## Repro

Offline: item hidden with no error; colour pickers dead until reload.

## Done

(none yet)

## Needs doing

- try/finally, revert optimistic state, show error.
- Red test first where a seam exists (`tdd`).
