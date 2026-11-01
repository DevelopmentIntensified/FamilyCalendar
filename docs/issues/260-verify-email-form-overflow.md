# 260 — Verify-email banner form overflows at 320px

Status: open

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

Same layout: `<form class="flex w-full items-center justify-center gap-2">` no wrap; ~322px content in 288px.

## Repro

Unverified user on 320px device -> horizontal scroll.

## Done

(none yet)

## Needs doing

- `flex-wrap` and/or `min-w-0 flex-1` input.
- Red test first where a seam exists (`tdd`).
