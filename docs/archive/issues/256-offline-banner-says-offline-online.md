# 256 — Offline banner says "You're offline" while online

Status: done

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`src/lib/components/OfflineBanner.svelte` visible when pending/synced, offline paragraph unconditional.

## Repro

Reconnect after queued change -> 'You're offline — … Synced 1 change.'

## Done

- `OfflineBanner.svelte`: offline explanation paragraph wrapped in `{#if !online}`; online pending/synced states show only their status line.
- Red-green: new `src/lib/components/OfflineBanner.svelte.test.ts` (online + 2 pending -> no "You're offline"; offline -> explanation shown).

## Needs doing

(none)
