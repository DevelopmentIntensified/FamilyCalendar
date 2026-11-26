# 326 — Calendar toolbar overflow buttons: icons, no side scroll

Status: done

Area: v2 rewrite (calendarPage)

## Done

- Filters/Import/Print/Day dashboard/Calendar settings are icon-only buttons (aria-label + title tooltip) in `ui/CalendarToolbar.svelte`; the accessible names are the old labels (`Filters`, `Import`, `Print`, `Day dashboard`, `Calendar settings`).
- The strip's `overflow-x-auto` container is gone: the strip is a fixed 40px-tall group of 32px icons (Filters keeps its hidden-count badge inline). Below md it is replaced by the ⋯ menu.
- Measured in Chrome against the real component: header `scrollWidth == clientWidth` at 1280, 1150, 1024, 768, 640, 375 and 320px; no element has `overflow-x: auto|scroll`.
- `ui/CalendarToolbar.svelte.test.ts` pins names + titles + no visible word, and that no header element is a scroll container.
