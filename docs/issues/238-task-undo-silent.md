# 238 — Undo on recurring-complete toast fails silently

Status: open

Source: repo bug audit 2026-11-01 (lane D).

## Evidence

`src/lib/client/taskFeedback.ts:85` `if (!res.ok) return false;` no toast, no try/catch around fetch.

## Repro

Tap Undo offline or twice -> nothing, no message.

## Done

(none yet)

## Needs doing

- try/catch + `pushToast` "Couldn't undo — try again".
- Red test first where a seam exists (`tdd`).
