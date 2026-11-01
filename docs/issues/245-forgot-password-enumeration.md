# 245 — Forgot-password shows red error for unknown emails (account enumeration)

Status: open

Source: repo bug audit 2026-11-01 (lane E).

## Evidence

`src/routes/(marketing)/forgot-password/+server.ts:59` `json({ error: 'If an account exists…' }, {status:200})`; page treats `json.error` as failure.

## Repro

Unknown email -> red banner; known -> success screen.

## Done

(none yet)

## Needs doing

- Return `{ success: true }` for unknown emails.
- Red test first where a seam exists (`tdd`).
