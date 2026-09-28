# Calendar UI — analysis & prototypes

Analysis of the calendar page (`src/routes/(calendar)/calendar`, ~8,300 LOC across 41
components) against the marketing surfaces, plus three working prototypes that keep the
full feature set and adopt the marketing visual language.

**Nothing in `src/` is touched.** Open `index.html` in a browser.

## Files

| File | What it is |
|---|---|
| `index.html` | The writeup. Findings, the three directions, parity table, recommendation, order of work. |
| `0-current.html` | Baseline — the shipped UI reproduced class-for-class from the real components, so the comparison is honest. |
| `a-warm-studio.html` | **A** — lowest-risk re-skin. No re-architecture. |
| `d-working-calendar.html` | **D** — the synthesis, built from the round-1 review. B's rail + A's toolbar + the legend moved out. |
| `b-focus-sidebar.html` | **B** — persistent rail: filters, up-next, search, mini-month. |
| `c-day-first.html` | **C** — the calendar stops being the landing surface. |
| `proto.css` | Design tokens copied exactly from the marketing pages. All three prototypes share it. |
| `proto-data.js` | Mock data (63 events + 8 tasks) shaped like the app's `Event` type, plus chip/markup renderers. |
| `proto-shell.js` | The shared view engine. All three prototypes are the same engine with different chrome. |
| `proto-nav.js` | The prototype switcher. Self-initialising, injected into all five pages. |
| `feedback.js` / `feedback.css` | Section-feedback overlay. Copied from `~/.agents/skills/prototype/assets/feedback/`. |
| `serve.mjs` | *(removed)* superseded by the skill's `collector.mjs`, which also collects feedback. |
| `smoke.mjs` | 26 headless assertions over every view and interaction. |
| `lint.mjs` | Structural lint: tag balance, dangling refs, duplicate ids, per-page render, CSS token sanity. |
| `nav-check.mjs` | Switcher check: mounts everywhere, one active state, links resolve, no collision with the FAB / bulk bar / sheets. |
| `feedback-check.mjs` | Overlay check: discovery, selection, verdicts, notes, redo, markdown, keyboard, offline fallback, and that every real page is wired and marked. |
| `feedback-e2e.mjs` | End-to-end against a live collector: real page → real selection → written file. |
| `sync-baseline.mjs` | Regenerates the baseline's inline data from `proto-data.js` so the two never drift. |

## Running

```sh
node "C:\Users\MIRP\.agents\skills\prototype\assets\feedback\collector.mjs" --root . --port 4179
```

Then open **http://127.0.0.1:4179/**

`collector.mjs` serves the pages *and* collects feedback. It supersedes the ad-hoc
`serve.mjs` this folder used to carry. **ES modules are blocked on `file://`** — the
prototypes must be served over HTTP or they render blank.

## Marking up a page

There is no toolbar sitting at the bottom of the page. There is one small **dock** in the
corner — 36px, with a badge showing how many marks are on this page. Everything lives
behind it.

1. **Click the dock** (or press `M`) → **Review** opens the toolbar
2. **Select elements** (or press `F`)
3. Hover anything — a box and a label tell you what you'd be pointing at
4. Click it — a comment card opens on the spot, pinned to that element
5. Verdict + note, then move on

The same menu also has **Switch prototype** and **All prototypes** (the tree). Only one
panel is open at a time, `Esc` closes the menu and then the panel, and `M` toggles the
menu.

| | |
|---|---|
| `click` | select that element |
| `alt`+`click` | select its **parent** — coarser, for "this whole toolbar" |
| `shift`+`click` | add to / remove from the marks |
| `1` `2` `3` | good / bad / idea on the open card |
| `j` `k` | next / previous mark |
| `F` / `Esc` | start-stop picking / close |

**Bad is the rebuild queue** — it's what I act on, and it auto-ticks *redo this*. **Good** matters just as much: it stops me re-litigating something you already approved. Marking something *good* with no note is the cheapest way to make a decision stick.

Marks become numbered pins that stay stuck to their element across scroll, coloured by verdict. The toolbar tallies them and shows how many marks sit on **other** prototypes; **List** opens a panel you can switch between this page and all of them.

Each mark carries its selector, bounding box, computed styles, outer HTML and visible text — so I can find the exact thing you were looking at, and notice if it's drifted.

### Rounds — reviewing is iterative

Feedback accumulates in **rounds**, not one flat list. Hit **New round** when you're done with a pass: it closes and the next one opens empty. Nothing is deleted.

That matters because the *sequence* is the information. If you mark the same element bad again in round 2, the fix didn't land — the tool knows that, and tells me:

```
### Round 2 — OPEN
> **1 carried over from an earlier round**, 1 of them still bad — the last fix did not land.
>   `[data-fb="rail-members"] > div.rail__title` bad→bad — still says WHOSE PLANS
```

`bad→good` = it landed. `bad→bad` = I missed it.

I close a round from my side with the outcome recorded, so the ledger reads:

```
r1  DONE      2 marked, 2 bad  — folded the toolbar into one row
r2  OPEN      1 marked, 1 bad
```

### One store, every prototype

Marks go into a single localStorage store keyed by page. Mark up A, then B, then C, and hit **List → All → Copy** on whichever page you're on to get the lot. Old per-page marks are migrated automatically.

Every page also declares **what it is** in an `#fb-page` JSON block — label, the design question it's testing, its approach, and the risk. So a review comes back saying *"Prototype B · Focus Sidebar — does moving filtering into a rail beat the toolbar?"* rather than just a filename, and cross-variant notes like *"I prefer the toolbar from A"* are resolvable without opening anything.

### Movable

Both tools — the review toolbar and the variant switcher — are behind one collapsed dock, and **the dock is the only thing you drag**. Grab it anywhere that isn't a button and move it; the panels follow, because they are placed relative to it. The position is remembered per browser; **double-click** the dock to snap it back.

### Getting it to me

- **Nothing to do** — I read `feedback/` and print each page's identity plus its siblings.
- **Or** hit **Copy**, and **List → All** if you reviewed more than one.

```sh
node "...\assets\feedback\read.mjs" --out .\feedback              # every mark, every round
node "...\assets\feedback\read.mjs" --out .\feedback --redo-only  # only the bad ones
node "...\assets\feedback\read.mjs" --out .\feedback --rounds     # the round ledger
node "...\assets\feedback\read.mjs" --out .\feedback --close 1 --outcome "what I changed"
```

`data-fb` markers (30 across the five pages) are optional — the picker works on any element. They add a coarse handle so a mark inside a region says *which* region.

If the collector isn't running the overlay falls back to `localStorage` and says so — **Copy** is then the way through.

## Prototype switcher

Every page carries a fixed switcher in the **bottom-left** corner — the one corner the
app's own fixed chrome doesn't own (FAB is bottom-right, bulk bar bottom-centre). It
collapses to `≡ 0 A B C` under 640px and gains full labels at ≥900px.

Its `z-index` is **55**, deliberately below the FAB (70), bulk bar (75), range pill (85)
and sheets (80/90), so a modal or an active bulk selection covers it rather than floating
over it. `0-current.html` carries `body.has-fixed-footer` to lift itself clear of the
baseline's full-width footer.

It is deliberately dark, small and visually distinct — it is scaffolding, and should never
be mistaken for a proposed product surface.

## Verifying

```sh
node prototypes/calendar-ui/smoke.mjs   # all green
node prototypes/calendar-ui/lint.mjs    # clean
node prototypes/calendar-ui/dock-check.mjs   # the chrome really is collapsed
node prototypes/calendar-ui/sync-baseline.mjs   # after editing proto-data.js
```

Every suite runs headless in jsdom — no browser needed. `dock-check.mjs` is the one worth
knowing about: it asserts the dock is genuinely collapsed (no panel visible on load),
that the menu opens both tools one at a time, that `Esc` backs out, that the badge tracks
the mark count, that the dock is the only draggable thing, and that the whole pick → note
→ verdict → persist loop still works with the dock in place.

## Feature parity

Every prototype preserves the shipped feature set, not a subset. The engine in
`proto-shell.js` implements:

- Month / Week / **Day** / List views (Day is promoted into the toggle — today it is only
  reachable by tapping a date cell)
- Range-select → floating pill with −15 / +15 / Create / ✕, incl. 15-minute snap
- Drag-move between days; Add mode for touch; Select mode mutually exclusive with Add mode
- Bulk bar: delete, move-to-calendar, location, attendants, smart 2-phase dry-run plan
- NLP quick add with multi-parse; Event ⇄ Task tabs; recurrence; RSVP; checklists
- Delete scopes: this occurrence / whole series / single
- Swipe month nav, keyboard nav, month/year nav, jump-to-today
- Per-cell `+`, `+N more` overflow sheet, day detail sheet, mobile day action sheet
- Overdue task highlighting, recurring glyphs, RSVP tint, attendance/creator badges
- Toasts with undo affordance; mobile/tablet responsive drawer in B

## New capability (not in the current UI)

| | A | B | C |
|---|---|---|---|
| Calendar visibility filters + legend | ✓ | ✓ | ✓ |
| "Up next" list | — | ✓ | ✓ |
| Search (⌘K) | — | ✓ | — |
| Per-member "whose plans" filter | — | ✓ | — |
| "Right now" / next-up band | — | — | ✓ |

## Round 1 verdict

The review pointed one way, so rather than patch the losers it became a fourth prototype.

| | |
|---|---|
| **Kept** | A's toolbar row ("this looks great") · B's mini month · B's up next · B's calendar filters |
| **Changed** | Toolbar is one row (was 185px — it was doing two jobs) · legend moved under the grid · "Whose plans" → "By person" · C's vague copy made explicit |
| **Dropped** | C's hero band ("feels dashboardy, not calendar feel") · C's toolbar ("the others are better") |

The two toolbar complaints had the same root: the toolbar was carrying the *controls*
(which belong together) **and** a *key* (which belongs with the thing it explains). So the
toolbar is now one row of controls, and the key is a slim strip sharing a border with the
grid underneath it.

Still untested: the rail costs 14% of grid width at 1280px, so cells fit fewer chips on a
laptop. That trade-off came across from B and has not been checked.

## Original recommendation

**Ship A, then B; treat C as a bet behind a toggle.** Round 1 largely confirmed it.

- A closes the entire style gap for a class-level change in six components with no state
  machine touched, and it fixes two genuine usability bugs (11px/26px tap targets, and Day
  view being unreachable from the toolbar).
- B is where the real *functional* win is. Zero filters on a shared family calendar is a
  larger problem than the colours — event colour is currently discoverable only by
  hovering a chip, and `CalendarSelector.svelte` exists with zero importers.
- C is the only one that risks the power-user habit of scanning the month. It must be
  collapsible and remembered in `localStorage`, the way `resolveInitialView` already
  handles view persistence.

Suggested order: tokens → accessibility floor → A → filters → B → C behind a flag.

## Watch out for

- **`/calendar/print` inherits these classes.** Gate every decorative change behind
  `print:` variants, the way the app already does.
- **41 colocated tests assert class strings.** Restyling is test-breaking by definition —
  update the assertions deliberately, don't loosen them.
- **Contrast.** Tinted chip backgrounds at 12px still need 4.5:1. `#FED5CF` with
  `text-slate-800` passes; the lighter tints need checking.
- **Mobile (<640px) keeps today's 3-chip + action-sheet behaviour.** Only the skin changes.
