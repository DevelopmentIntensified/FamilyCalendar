# 253 — Mobile hamburger menu stays open after navigation

Status: done

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`src/lib/components/Navbar.svelte` `isOpen` only reset by menu links; NotificationBell `goto` (NotificationBell.svelte:86), bottom tabs, logo don't close it.

## Repro

Open menu, tap bell -> alert: page changes, menu still covers it.

## Done

- `Navbar.svelte` registers `afterNavigate` that resets `isOpen` + `profileDropdownOpen`, so bell `goto`, bottom tabs, logo all close the menus.
- Red-green: `Navbar.svelte.test.ts` "closes the mobile menu when any navigation completes" (mocks `afterNavigate`, fires callback, asserts menu closed).

## Needs doing

(none)
