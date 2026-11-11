# 223 — Event detail modal shows old data after Edit -> Save

Status: done

Source: repo bug audit 2026-11-01 (lane B).

## Evidence

`src/lib/components/calendar/EventModal.svelte:274-277` `handleUpdate` dispatches update and returns to detail view with stale `event` prop; parents only `invalidateAll()`.

## Repro

Day view -> event -> Edit -> change title -> Save -> modal still shows old title; no toast.

## Done

- `EventModal.svelte` `handleUpdate`: still dispatches `update` (parents refetch), then `pushToast('Saved "<title>".')` and `close()` (dispatches close + `onClose`) instead of returning to the stale detail view.
- Test (`EventModal.svelte.test.ts`): `EventModal - save from edit (#223) > closes on save and toasts instead of showing the old title` (Edit -> rename -> submit #event-form -> PUT). Red: onClose 0 calls (detail view re-shown with old title) -> green. Full `src/lib/components` suite 829/829.

## Needs doing

(none)
