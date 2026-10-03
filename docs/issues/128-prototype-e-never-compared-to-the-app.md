# 128 — Prototype E was never compared against the product

Status: open

Source: read-only comparison, 2026-10-03, after the owner corrected the
process — *"if I approved the prototype, keep the way it looks and rebuild the
page using that look and function."*

**Blocked by:** **the 640–767px decision below.** Nine of the ten gaps are
mechanical. The tenth needs the owner, because building E faithfully would undo
work approved two rounds earlier.

## Why this ticket exists

E is approved. Its *layout* was never compared against `/calendar`. Everything
that shipped as #119/#120 was **mark-driven** — each review mark got fixed — but
nobody stood E's finished page next to the product and asked whether they match.

There is a second irony. E was itself built *by an agent from D*, so it is a
picture derived from a picture. #121 says a prototype that lies is worse than
none, and E may have drifted before anyone compared it.

## The gaps

Every one is buildable. Ordered by how much of the page it affects.

| # | Gap | E | App |
|---|---|---|---|
| 1 | **Toolbar uncapped, grid capped** — above 1280px the toolbar runs to the viewport edge while the grid stops at 1536px, and their padding is 16px vs 32px | one welded 1.5rem-radius card, `max-width:80rem` | `Calendar.svelte:327` full-bleed uncapped, `:360` `max-w-screen-2xl` |
| 2 | **375px: the grid is not the page** — chips are `min-h-[26px]`, so a busy day is ~190px in a 72px box and six rows run ~1150px down a phone | grid is the page | `MonthDayCell.svelte:172,269` |
| 3 | **Filters button carries no word** | `Filters` label + badge, visible ≥640px | icon-only `w-11`, `CalendarToolbar.svelte:332-334` |
| 4 | **Per-cell `+`/dashboard tools** — absent below 768px, and never hover-gated above it | present at every width, hover-revealed via `opacity:0` | `MonthDayCell.svelte:98` `hidden … md:flex`, always-on at ≥768 |
| 5 | **Day-number disc** — 28px circle on *every* day | 28px, every day | 20px, circle only when today (`MonthDayCell.svelte:83-87`) |
| 6 | **Cell chrome** — 14px radius, `#e2e8f0` border, white background, 8px/10px padding, weekend gradient | all present | 8px radius, `#f1f5f9`, no background, 2px padding, no weekend treatment (`:67-71`) |
| 7 | **768px toolbar columns** — three columns where E is not until 1150px | — | `CalendarToolbar.svelte:322` scrolls, and the toggle overflows its `min-w-0` column |
| 8 | **768px filters surface** — a 16rem anchored popover | a centred 26rem sheet | `CalendarToolbar.svelte:471,477` |
| 9 | **The Key strip** | present (`e:208`) | absent |
| 10 | ⚠️ **Day-tap threshold: 640 vs 768** — at 640–767 E opens the day view, the app opens `DayActionSheet` | `< 640` → sheet | `max-width: 767px` (`MonthDays.svelte:104`) |

### 🔴 Gap 10 needs the owner, and it is not a port

**Building E faithfully here re-opens the exact defect #119 closed.** E's rule is
`< 640 → DayActionSheet`; the app's is `< 768 → DayActionSheet`. So at 640–767
they do different things, and E's version is the one you rejected.

Pick one: **keep 768** (the #119 decision) and treat E as wrong here, or **move to
640** and accept the band re-opens. Do not let a port decide it silently.

## App-only — NOT gaps, do not remove

Recorded explicitly so nobody proposes it later. Listed by the comparison agent
as "not a gap to close":

- hover prev/next arrows over the grid (`Calendar.svelte:376-393`)
- skeleton, load-warning, retry, first-run states and **three empty states**
  (filter, search, assignee) — `Calendar.svelte:394-523`, `+page.svelte:502-573`
- `DailyVerseCard` (`:364-372`); print + calendar-settings actions
- the FAB at `bottom-24 right-6`, which clears `BottomNav` (`+layout.svelte:142`)
- `resolveInitialView`'s width rule for the opening view — E has a static grid
- `?view=` / `?edit` / `?quickadd` deep links

Also: **E's hard-coded fixture family is not a feature.** A page showing one
fake family is not "better" than a real query.

## 🔴 A false claim on E itself

`e:143` asserts *"the app's cell is `overflow-hidden` at a fixed minimum"*. That
is **false** — `overflow-hidden` clips only *after* the box has already grown,
which is precisely why gap 2 exists. A defect asserted on the prototype was being
used to justify a real one in the product. Fix the claim on E.

## What the comparison could not verify

- **Every pixel figure is arithmetic on Tailwind class defaults**, not a browser
  measurement. No `screens` override in `tailwind.config.js`, so `sm`=640,
  `md`=768, `lg`=1024 are defaults. Exact parts: at 768px the row has 736px of
  content, 720px after two 8px gaps; with all text at zero width the three columns
  still need ~663px, so `sm:` cannot fit at any font size.
- **Rendered cell heights and label widths need a live viewport.** Not measured.
- E's own 828px fold claim is likewise arithmetic (`e:417`).

**So gap 2's "~1150px down a 375px screen" is arithmetic, not observed.** Measure
it in a real browser before treating it as a number to fix to.
