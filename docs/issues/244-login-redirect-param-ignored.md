# 244 — ?redirect= ignored by login/signup; invitees lose the invite

Status: open

Source: repo bug audit 2026-11-01 (lane E).

## Evidence

`family/join/[code]/+page.svelte:129,135` and `checkout/+page.server.ts:18` send `?redirect=`; `login/+page.svelte:51,97` and signup `:68,115` always `goto('/calendar')`.

## Repro

Signed-out invitee -> 'Sign in to join' -> lands on /calendar, never joins.

## Done

(none yet)

## Needs doing

- Honour `redirect` (same-origin relative paths only).
- Red test first where a seam exists (`tdd`).
