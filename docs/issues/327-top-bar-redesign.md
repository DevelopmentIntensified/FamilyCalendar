# 327 — Calendar top bar redesign

Status: done

Area: v2 rewrite (calendarPage)

## Done

- Every control on the bar is 40px tall: view switch (`h-10 p-1`, 32px segments), date pill (label button now `h-10`; was 48–52px), Add, Select, icon strip (`h-10 p-1`), ⋯ trigger (was 44px) and the search field.
- Grouping is view switch | date nav | modes + actions; the actions are one bordered icon group instead of a strip of loose bordered pieces.
- Below md the icon group collapses into one ⋯ button (the existing action sheet), never a scrolling strip; phone paddings tightened (`px-2.5`, `gap-1`) so 320px fits.
- Search stays on its own full-width row beneath the controls (existing #120 contract).
- `ui/CalendarToolbar.svelte.test.ts` pins the shared height and the md collapse.
