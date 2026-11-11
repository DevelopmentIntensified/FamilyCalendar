# 239 — Groceries mutations have no network-error handling (stuck busy state)

Status: done

Source: repo bug audit 2026-11-01 (lane D).

## Evidence

`src/routes/(calendar)/calendar/groceries/+page.svelte` `check`/`uncheck`/`setColour`/`saveStores`/`move`/`remove` bare awaits; `colourBusy`/`busyId` stuck on throw.

## Repro

Offline: item hidden with no error; colour pickers dead until reload.

## Done

- Confirmed real: a thrown fetch escaped as an unhandled rejection — optimistic hide/colour stayed applied, no error, `busyId`/`colourBusy` never reset.
- Added `send()` (fetch → `null` on throw) + `failure()` copy helper ("… — check your connection and try again." when offline, "… Try again." on non-ok, so existing copy unchanged).
- `check`/`uncheck`/`setColour`/`saveStores`/`move`/`remove` use `send`; same revert path for throw and non-ok; busy flags reset in `finally`.
- Red→green: `page.svelte.test.ts` "network failures (239)" — 6 tests (fetch rejects): revert + alert + second attempt reaches the network. 66/66 pass.

## Needs doing

(none)
