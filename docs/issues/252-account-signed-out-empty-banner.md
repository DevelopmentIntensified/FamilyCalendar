# 252 — Signed-out account form posts show an empty red banner

Status: open

Source: repo bug audit 2026-11-01 (lane E).

## Evidence

`requireUserAction` returns `{error}`; `account/+page.svelte:76` renders `form.message`.

## Repro

Session expired, submit any account form -> blank red banner.

## Done

(none yet)

## Needs doing

- Render `form.error ?? form.message`.
- Red test first where a seam exists (`tdd`).
