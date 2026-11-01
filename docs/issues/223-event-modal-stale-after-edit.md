# 223 — Event detail modal shows old data after Edit -> Save

Status: open

Source: repo bug audit 2026-11-01 (lane B).

## Evidence

`src/lib/components/calendar/EventModal.svelte:274-277` `handleUpdate` dispatches update and returns to detail view with stale `event` prop; parents only `invalidateAll()`.

## Repro

Day view -> event -> Edit -> change title -> Save -> modal still shows old title; no toast.

## Done

(none yet)

## Needs doing

- Close modal on update (or re-find by id) and push a 'Saved' toast.
- Red test first where a seam exists (`tdd`).
