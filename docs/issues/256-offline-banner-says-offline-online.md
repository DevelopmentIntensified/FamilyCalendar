# 256 — Offline banner says "You're offline" while online

Status: open

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`src/lib/components/OfflineBanner.svelte` visible when pending/synced, offline paragraph unconditional.

## Repro

Reconnect after queued change -> 'You're offline — … Synced 1 change.'

## Done

(none yet)

## Needs doing

- Wrap offline paragraph in `{#if !online}`.
- Red test first where a seam exists (`tdd`).
