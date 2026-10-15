# 172 — Touch targets below 44px: banners, checkboxes, rails, selection bar

Status: open

Source: UI audit (issue 135), 2026-10-15. Static class reads; dimensional claims need a real browser (Playwright) before fixing — one arithmetic claim in this repo already understated a page by 139px.

## Done

- Calendar layout banners dismiss `rounded-full p-1` ~24px (`calendar/+layout.svelte:87,107`) — FAIL.
- Groceries checkboxes `h-5` 20px (`groceries:593,827`), rail selects `py-0.5/1` (`631,678,762`) — FAIL. Scope pills `min-h-44px` PASS (`437`).
- Calendar selection bar `py-2.5` marginal (`+page.svelte:656`); FAB `h-16` PASS.
- MonthDayCell links `pointer-events-none` until focus-visible (`MonthDayCell.svelte:132-156`) — keyboard Esc exits selection; verify operability in-browser.
- PASS set: navbar `h-11` hamburger, bottom-nav `min-h-52px`, family `min-h-11` CTAs, event rows `py-2/min-h-11` marginal.
- Related open item: #015's 44px hour-grid steppers (~24px) — same fix shape, do not file twice.

## Needs doing

- Measure each cited target in Chromium at 320px + 1280px, record expected/actual per #135's ticket shape, then fix red → green. No fork.
