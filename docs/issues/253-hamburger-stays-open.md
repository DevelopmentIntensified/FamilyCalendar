# 253 — Mobile hamburger menu stays open after navigation

Status: open

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`src/lib/components/Navbar.svelte` `isOpen` only reset by menu links; NotificationBell `goto` (NotificationBell.svelte:86), bottom tabs, logo don't close it.

## Repro

Open menu, tap bell -> alert: page changes, menu still covers it.

## Done

(none yet)

## Needs doing

- `afterNavigate(() => { isOpen = false; profileDropdownOpen = false; })`.
- Red test first where a seam exists (`tdd`).
