# 330 — Day Dashboard header: centered, aligned with cards

Status: done

Area: v2 rewrite (dayDashboard)

## Done

- `src/lib/screens/dayDashboard/ui/DayDashboardPage.svelte`: header is now `mx-auto w-full max-w-5xl flex-col items-center text-center` — the same container classes the cards use in `DashboardBand.svelte` — with no `justify-between`. Title + date centered; the Today/prev/next pill and the Open Day View / Back to Calendar links sit together on one centered, wrapping row (`flex-wrap justify-center gap-2`), so at <640px they stack and wrap without horizontal overflow.
- Open Day View and Back to Calendar are `inline-flex h-10` (40px, same height as the DayNav pill, which is `h-10`).
- `DayDashboardPage.svelte.test.ts`: added a header-layout test (max-w-5xl, mx-auto, centered, no justify-between, h-10 links).

## Needs doing

- Visual check at 375px and 1440px in a browser (not run here: the page needs a seeded DB/auth session).
