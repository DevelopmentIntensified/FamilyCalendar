# 238 — Undo on recurring-complete toast fails silently

Status: done

Source: repo bug audit 2026-11-01 (lane D).

## Evidence

`src/lib/client/taskFeedback.ts:85` `if (!res.ok) return false;` no toast, no try/catch around fetch.

## Repro

Tap Undo offline or twice -> nothing, no message.

## Done

- Confirmed real: non-ok returned false silently; a network throw escaped as an unhandled rejection from the toast's `onAction`.
- `undoTaskWithFeedback` wraps fetch in try/catch; both failure paths `pushToast` "Couldn't undo — …" naming the next step (check connection / refresh and retry), return false.
- Red→green: new `src/lib/client/taskFeedback.test.ts` (success toast, non-ok toast, fetch-throw toast).

## Needs doing

(none)
