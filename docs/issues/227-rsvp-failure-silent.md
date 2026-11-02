# 227 — RSVP failure reverts silently

Status: done

Source: repo bug audit 2026-11-01 (lane B).

## Evidence

`EventRsvpRow.svelte` `handleRsvp`: on !ok / throw only reverts status, no toast.

## Repro

Offline or 4xx/5xx -> 'Going' flashes then reverts, no message.

## Done

- `EventRsvpRow.svelte` `handleRsvp`: both failure branches (!ok, throw) revert AND `pushToast("Couldn't save your RSVP — try again.")`.
- Tests (`EventRsvpRow.svelte.test.ts`): `on server error reverts and toasts (#227)`, `on network failure reverts and toasts (#227)` — read the real `toasts` store. Red: toasts [] -> green.

## Needs doing

(none)
