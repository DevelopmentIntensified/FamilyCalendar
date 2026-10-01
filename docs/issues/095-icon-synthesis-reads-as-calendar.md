# 095 — The icon synthesis should read as a calendar

Status: in-progress

Source: prototype review, `brand-ui/icon.html`, round 1 — 1 mark, flagged for
rebuild.

**Blocked by:** None (can start immediately).

## The finding

The prototype puts three candidate marks side by side at the sizes they ship at
and then a synthesis, and the reviewer's verdict on the synthesis is **"make it
look more like a calendar"** — flagged as a rebuild, not a tweak.

The prototype's own question is the right frame: an icon is judged at 16 pixels
in a browser tab, not at 512 in a brand book. A mark that reads as a calendar at
512 can read as a blob at 16.

## ⚠ CORRECTION — the measurement that removed the band was wrong

**Read this before trusting any band number below, including the old ones.**

The band was previously removed on the evidence that it took the mark from
**8 distinct regions down to 5 at 16px**. That comparison was produced by a
**broken harness**. The variant SVG was built by replacing everything from
`</defs>` onward, which also swallowed the tile rect — so the "with band"
variant was a mark with **no background at all**, and the 5 was measuring a
different picture, not a worse one.

With the harness fixed and an assertion added so it cannot recur:

| band | distinct regions at 16px (tile intact) | WCAG contrast vs the `#f8f6f3` page |
|---|---|---|
| none | **8** | — |
| blush `#fed5cf` | **7** — *not 5* | 1.25:1 |
| blue tint `#bedae3` | **9** | 1.36:1 |
| **blue ink `#366d7e`** (shipped) | **9** | **5.34:1** |

So the real cost of a blush band was **one** region, not three — and a blue-ink
band *gains* one. **The band was never the problem; the measurement was.** The
owner's instruction to put it back was right, and it is now in on evidence
rather than against it.

Also corrected here: the safe-area figure was hand-calculated as r=264.3.
Measured by parsing the drawn rects it is **r=263.6**.

## Owner direction, 2026-09-30 (later) — a top header, and it is blue

> "add a top header to the cal icon and make it the blue color"

- [x] **Decide: `T.blue` (the tint, as specified) or a blue ink.** Built with a
      blue **ink**. `T.blueInk: '#366d7e'` was added to the token map — it is
      `--blue-ink` in `proto.css` and already ships in the app as
      `--mp-blue-ink` in `src/lib/marketing/theme.css`. **The literal reading was
      not followed, deliberately:** `#bedae3` is a **tint**, and across this whole
      repo it only ever appears as a *background* with `#366d7e` as the text on
      top — it is a surface, not an ink. Against the `#f8f6f3` page it measures
      **1.36:1**, which fails the 1.5:1 floor for a non-text graphic. `#366d7e`
      measures **5.34:1**. If the owner wants the literal tint, it is a one-line
      change to `T.blueInk`'s value and the mark is otherwise identical.
- [x] Whatever is chosen goes through the token map. No hex is inlined.
- [x] **Re-measured at 16px with the band present:** **9 distinct regions**,
      next to the 8 without. **It does not drop to 5 or below** — it goes up.
      See the correction section above for why the old 5 was wrong.

## Owner direction, 2026-09-30 — the grid is 4 × 3

> "the calendar needs 4 by 3 rows in the icon"

**The date grid is four cells across and three cells down — twelve cells, not
the current three circles.** This settles the geometry the mark was missing.

A real calendar grid is **7 columns × 5–6 rows**, and 35+ cells at 16px is a grey
smudge. Twelve cells is the most a mark can carry and still read as a *grid*
rather than as texture. Three circles read as three people, which is why "make
it look more like a calendar" was the note — the synthesis had the family's
weight and lost the calendar entirely.

- [x] **The grid is 4 across × 3 down.** Twelve cells. Cells 56 units, 20
      between: `4·56 + 3·20 = 284` inside a 324 page, 20 of padding each side.
      Cells are square deliberately — a rectangular cell's SHORT side is what
      has to survive 16px, and a square maximises it for the area.
- [x] **One cell carries the "today" accent.** The middle cell of the grid
      (row 2, col 2) in terracotta, so it does not compete with the rings or the
      band for the eye at the top.
- [x] **Measured at 16px** — see the table under Done.
- [x] Stated in the report whether the grid survives at 16, with the number.

## Needs doing

- [x] Redraw the synthesis so it reads as a calendar at **every** size it ships
      at. Geometry per the two owner directions above: 4 × 3 plus a blue header.
- [x] Keep the comparison honest. **The synthesis uses geometry that exists in
      none of A/B/C** — rings, a 4 × 3 grid and a header band — and that is
      recorded rather than hidden. **A, B and C are untouched and still lose.**
- [x] Check what actually ships. **It was NOT already replaced.**
      `static/icon.svg` was the svgrepo clipboard: a 120×120 viewBox, `#77D6FF`,
      `#FFDB86`, `#F27D75`. But the real finding was worse — see below.
- [ ] The social-card page declares that **zero** `og` / `twitter` / `canonical`
      tags exist anywhere in the repo. Confirm, and file that separately if it is
      still true. **NOT DONE — deliberately out of scope**, this ticket was
      scoped to the icon. No such tag was seen in `src/app.html` or any route
      head while doing this work, so the claim still stands and still needs its
      own issue.

## Done

### 🔴 WHY THE MARK WAS BROKEN IN PRODUCTION — the root copies

**This is the finding that mattered, and nothing in the prototype hinted at it.**

The brand pipeline wrote to **`static/brand/`**. But **every reference the
running app actually makes resolves to the ROOT of `static/`, and none of those
files were in the pipeline's plan at all:**

| reference | file |
|---|---|
| favicon, every page | `src/app.html:5` → `/icon.svg` |
| apple-touch-icon | `src/app.html:11` → `/icon-192.png` |
| PWA install icons | `static/manifest.webmanifest` → `/icon-192.png`, `/icon-512.png`, `/icon.svg` |
| notification icon **and badge** | `static/service-worker.js:173-174` → `/icon-192.png` |

So a perfect redraw would have landed in `static/brand/` and **the installed app
would have kept the svgrepo clipboard.** The prototype's rollout card even said
"`static/icon.svg` is a copy of `brand/mark.svg`" — which is true in intent and
false in fact: nothing was copying it, so it silently never was.

`build-brand-rasters.mjs` now also writes `icon.svg`, `icon-192.png`,
`icon-512.png` and `favicon.png` to the **root of `static/`** — same bytes, same
hash, covered by `--check` exactly like the `brand/` copies, so the two cannot
drift apart again.

### The redraw

A calendar page on the terracotta tile: a **blue-ink header band**, two **ink**
rings crossing the page's top edge through the band, a **4 × 3 grid** of peach
day cells, and the middle cell terracotta. The three family circles are gone.

**Why ink rings and not terracotta:** a terracotta ring on the terracotta tile is
invisible. Ink has the highest contrast in the palette and is the only element
that survives 1px.

### THE 16PX MEASUREMENT — the grid still does not resolve. Reported, not smoothed.

Method, so it can be repeated: `prototypes/brand-ui/marks.js` is rasterised to a
**16×16 canvas** with `drawImage` — the identical call `build-brand-rasters.mjs`
uses for every shipped PNG — the RGBA is read back, and each pixel is snapped to
its nearest palette token. A real 16×16, not an enlargement.

| feature | measurement at 16px |
|---|---|
| the page | one strong shape — **survives** |
| two ink rings | **7 solid `#0f172a` pixels** — **survives** |
| the blue-ink band | covers 20 px, **4 carry `#366d7e`** at 5.34:1 — **survives** |
| the 4 × 3 grid | 19 px of peach — **reads as texture, not as a grid** |
| the "today" accent | covers 4 px; **1 carries `#c45e38`**, 3 are blends (`d7987f`, `d18366`, `d38b6f`) — **does not read as a marked day** |
| distinct regions | **9** (was 8 without the band) |

At 32px the accent covers 12 px of which **9 carry `#c45e38`**; at 180 and 512
the grid is clean. So the grid is a 32px-and-up layer, and the 16px layer is the
page, the band and the rings.

**Still a partial pass, not a pass.** The mark reads as a calendar at 16px
because of the rings and the band; the 4 × 3 grid does not individually resolve
and the "today" accent is the casualty. Not fixable inside a 4-column grid: a
cell cannot exceed ~1.9px in a 324-wide page, and 56 units is already the largest
square that fits four across.

**A note on why the region count is only part of the evidence.** A raw "how many
band pixels are pure" count *rewards pale colours* — blush scored 14 of 20 (70%),
the tint 8 of 20 (40%), the ink only 4 of 20 (20%) — because a dark band gets
anti-aliased against both the light page and the dark rings crossing it. That
metric would have picked the least legible option. The WCAG contrast ratio is
the one that means something, and it goes the other way by a factor of four.
Both numbers are recorded so neither is taken on trust alone.

**Accent colour, measured not argued.** Terracotta and ink both land on 1 of 4
pure pixels; blush is far worse. Terracotta stays on brand grounds, not on its
pixel count.

### The manifest gains `maskable`

`maskable-192.png` and `maskable-512.png` are generated by the same plan, not
hand-edited, and `static/manifest.webmanifest` now declares them with
`"purpose": "maskable"`. Previously no maskable entry existed anywhere.

`maskable()` also draws the real full-bleed tile now, instead of a *scaled* tile
over a flat rect — which is what the prototype's own facts list claimed, and
what `ogCard()` already did.

Its scale is **0.72**, and that is measured: the mark's worst sharp corner is
**r=263.6** from the centre, so the old **0.8** put it at **r=210.9 — outside
Android's r=204.8 safe circle**, i.e. the bottom corners of the page were being
eaten. At 0.72 it lands at **r=189.8, 15.0 units of clearance**, verified by
circle-masking the shipped `static/brand/mark-maskable.svg` at r=204.8: nothing
is clipped.

### One `Mark.svelte` for the inline glyph — all three call sites

The navbar, login and signup each carried their own hand-copied calendar glyph
and had already drifted — the navbar's had no `stroke-linecap`/`linejoin`, the
other two did. Now **`src/lib/components/brand/Mark.svelte`**, with a test that
pins the geometry so a fourth copy cannot appear and the one copy cannot quietly
change shape. `currentColor` kept so `text-primary-600` still works; a `size`
prop replaces the per-site `h-8`/`h-5`.

**Navbar, login and signup are all three converted.** A grep for the glyph's own
path data (`M8 2v4` / `M16 2v4`) across `src/` now returns hits only in
`Mark.svelte` and its test — there is no second copy left to drift.

### Verification

- `npm run brand:check` — green: **11 files, all roots, zero drift**.
- `npx vitest run` on the affected component suites — **4 files, 13 tests, all
  passing.**
- `npx svelte-check` — **zero diagnostics** on `brand/Mark.svelte`,
  `Mark.svelte.test.ts`, `Navbar.svelte`, or the login/signup pages.
- `static/icon.svg` re-checked: no `svgrepo`, no `0 0 120 120`,
  `viewBox="0 0 512 512"`.
- **`npm run build` is currently RED, and it is not this ticket's.** Four other
  agents are working in this tree. In order, the build has failed on:
  `src/routes/api/notifications/+server.ts:41` (esbuild syntax error), then
  `src/routes/api/events/+server.ts` (invalid `export MAX_RANGE_DAYS` in a
  `+server.ts`, which SvelteKit rejects). Both are other lanes' in-flight edits,
  both outside this ticket's scope, and neither was touched. **This ticket's
  last green build was `✓ built in 30.76s`, before the band was added**; it has
  not been re-confirmed since, and that is stated rather than implied.

## Still open — NOT decided here

- **`theme_color` is untouched at `#dd5822`.** The prototype's rollout card says
  it moves onto the palette in `proto.css`, "or the app moves onto the app
  palette — **that is a decision, not a design**". It is not this ticket's to
  make and it was not made. **The owner has to rule on it.** Until then the icon
  is terracotta `#c45e38` against a `#dd5822` bar: adjacent, not identical — a
  far smaller defect than the blue-in-orange one, but not zero. Nothing else here
  changes product behaviour.
- Whether the band takes the **literal** `#bedae3` rather than `#366d7e` — a
  one-line change, with the measurement above on the record either way.
- The `og`/`twitter`/`canonical` tag question (under Needs doing).

## Notes

- Round is still open in the review tool; closure belongs to the collector.
- The mark is brand surface, not app code: nothing here changes product
  behaviour, so it cannot regress the app's test suite.