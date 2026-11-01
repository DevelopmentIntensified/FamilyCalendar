# 259 — Calendar banners cover the toolbar (fixed mt-10 offset)

Status: open

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`src/routes/(calendar)/calendar/+layout.svelte` `<main>` gets `mt-10` regardless of banner stack height.

## Repro

Unverified user / offline at 375px -> toolbar hidden under banner.

## Done

(none yet)

## Needs doing

- Measure stack (bind:clientHeight on a plain div, per #200) and use as margin-top.
- Red test first where a seam exists (`tdd`).
