# 247 — Invitations page does not update after create/revoke or family switch

Status: open

Source: repo bug audit 2026-11-01 (lane F).

## Evidence

`src/routes/(family)/family/invitations/+page.svelte:9` one-time destructure of `data`.

## Repro

Create code -> toast but list unchanged; revoke -> still shown; switch family pill -> old codes.

## Done

(none yet)

## Needs doing

- Reactive destructure.
- Red test first where a seam exists (`tdd`).
