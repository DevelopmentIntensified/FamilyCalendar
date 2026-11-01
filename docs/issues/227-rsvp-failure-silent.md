# 227 — RSVP failure reverts silently

Status: open

Source: repo bug audit 2026-11-01 (lane B).

## Evidence

`EventRsvpRow.svelte` `handleRsvp`: on !ok / throw only reverts status, no toast.

## Repro

Offline or 4xx/5xx -> 'Going' flashes then reverts, no message.

## Done

(none yet)

## Needs doing

- `pushToast` "Couldn't save your RSVP — try again." in both failure branches.
- Red test first where a seam exists (`tdd`).
