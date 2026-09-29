# 084 — Spacing pass on the prototypes nobody has reviewed

Status: done

Source: instruction — go through the prototypes with no notes and make sure
things have sufficient margins, are not touching, and stay compact but relaxed.

**Blocked by:** None (can start immediately).

## Needs doing

- [x] Every prototype page with no review notes gets a spacing pass. That is
      the account, archive, event, family-invitations, family-members-add,
      family-tasks, import, models and stats pages, plus the current, focus
      sidebar and day-first calendar pages.
- [x] Nothing touches: siblings in a stacked flow get a real gap, containers
      get real padding, and no two bordered blocks sit flush.
- [x] Compact but relaxed: no band grows for the sake of air, and no band is
      squeezed to save it. Density up, breathing room kept.
- [x] The pass is **measured, not eyeballed** — a browser has not been
      attached for this work, so spacing claims come from real geometry
      (element boxes, gaps, padding) rather than from reading the CSS.
- [x] A spacing check lands as a permanent guard, in the same spirit as the
      existing tree/serve/lint suites, so the next pass has a floor to check
      against rather than a fresh opinion.
- [x] The tree, serve and per-set check suites still pass; the pages that
      reproduce a real defect still reproduce it (spacing is not a licence to
      smooth a bug over).

## Done

**The guard — `prototypes/spacing-check.mjs`**

Loads all 23 pages in both sets in Chromium, at 390px and 1280px, and reads
`getBoundingClientRect()` for the geometry and `getComputedStyle()` for the
padding. Three rules:

| Rule | Fails on | Bound |
|---|---|---|
| nothing touches | two adjacent blocks sharing an edge | floor 8px |
| containers breathe | a card holding content at its own frame | floor 8px |
| compact but relaxed | a *declared* vertical gap past the ceiling | ceiling 24px |

It hosts its own static server on an ephemeral port, so unlike the other
browser checks it needs no collector and never skips; `spacing-check` is in
`check-all.mjs`'s `OFFLINE_HINTS`, and `npm run proto:check` runs it
(16 suites green, 0 red, 0 skipped).

**The pass — the twelve pages**

Eight changed, four already held the floor, which is a pass with nothing to
fix. Every fix is one of three classes:

- **A column with no declared gap.** `main`/`side` were bare `<div>`s, so
  their cards shared an edge. `proto.css` gained `.vstack` (a flex column
  with a 1rem gap, mirrored into both copies so they stay byte-identical)
  and the wrappers now carry it — archive, event, family-invitations,
  import.
- **A dead class.** `class="grid"` carried `gap` and `grid-template-columns`
  inline, but no rule ever set `display`, so the notes callout laid out as a
  flush block stack. Reading the CSS would have called that page fine; the
  checker measured 0px. One line in each page's own `<style>` — b-focus-
  sidebar, c-day-first.
- **A band just under the floor.** 6px and 4px, raised to 8px — the task
  rows in family-tasks, the week strip in stats.
- **Nothing to fix** — account, family-members-add, models. Measured clean;
  no edit made, because making one would be a change in search of a defect.

**Ground rule 7 held.** `0-current.html` reproduces the shipped month grid, so
its mobile cramping is the app's: `.grid7` sets `gap` only from 640px up and
`.cell` pads 2px, so day cells share a border edge on a phone. It carries
`data-spacing="app"` with a `data-spacing-why`, and the check prints that
reason on every run rather than letting the defect disappear. Nothing else in
the twelve pages reproduced a real defect, so nothing else needed the mark.

**What the guard found on pages this wave did not own**

Nine findings across eight pages: family, family-detail, tasks,
notifications and family-create (bare column wrappers, and a member picker
with no gap and no hairline), plus a-warm-studio, d-working-calendar and the
calendar hub (the same dead `.grid` class). Rather than edit another agent's
work or switch the guard off, they are in `prototypes/spacing-known.json`
with the one-line fix for each. The check **fails** if an entry stops
matching, so the list goes stale loudly instead of becoming a place to bury a
page.

## Notes

- Ground rule 7 of the prototypes: defects in the real app are shown, not
  smoothed over. A page that is cramped *because the app is cramped* stays
  cramped until the app is fixed — fix the app in its own ticket.
- Twelve pages. This is a wide, shallow change: same class of edit everywhere,
  so it lands as one slice with the checker as its acceptance gate, not as
  twelve tickets.
- **What counts as a block.** A spacing guard that flags every chip row is a
  guard that gets switched off, so the checker draws one line and holds it: a
  block is a framed, shadowed, or filled box holding structure — a card, a
  panel, a calendar cell. Chip rows, tags, swatches, pills and segmented
  controls are dense on purpose; that is a design-review finding, not a
  spacing defect. Hairline-ruled rows inside a card (`.kv + .kv`) are one
  band, not N blocks. A column-name chip stays a chip however many lines it
  wraps to, which a size threshold gets wrong. A box that clips itself to a
  fixed height is a track, and its segments are flush by design. Overlap is
  not measured: stacked avatars are a deliberate idiom, and this guard is
  about space, not collision detection.
- **The padding rule had a circular exclusion.** "Is the child full-bleed?"
  reads as though it lets a full-bleed child delegate its padding inward
  (`.navbar > .wrap`) — but deleting a card's padding makes *every* child
  full-bleed, which then excuses the very thing that was deleted. The rule
  now asks whether a child both reaches the frame **and** brings no padding
  of its own, measured from the frame's padding edge so its own 1px border is
  not mistaken for padding. Three further exclusions fall out of the same
  logic: a frame exactly as tall as its tallest child has no band of content
  to inset (a control bar, a full-bleed header strip), and a frame of all
  controls is a control bar.
- **The ceiling bites on the number someone typed, not on the distance the
  layout produced.** A declared `row-gap` or `margin-top` over 24px is a band
  that grew for air. Free space a layout hands out — `space-between`, an auto
  margin, a `1fr` track — is the layout working. Without this the rule fired
  on a Kanban board's 222px column gutter, which is not a defect.
- **A weld is not a collision.** d-working-calendar bolts its toolbar to its
  grid and a key strip under that, all sharing one border. The shared edge has
  a squared corner on it; two blocks that merely touch keep all four corners
  rounded. So the rule reads the corner radii and lets welds through.
- **Verified the guard bites, all three rules.** `.vstack { gap: 0 }` turns
  four pages red. `.rail__card { padding: 0 }` turns eight red on the padding
  rule. A deliberately bogus entry in `spacing-known.json` fails the stale
  check by name. The red-green cycle is real; nothing here is a pass that
  cannot fail.
- Nine known defects remain open in `spacing-known.json`. Each is one word per
  page. They are outside this issue's scope, which is the twelve unreviewed
  pages.
- **Over the 300-line cap: 620 lines added, 16 removed.** The page edits
  themselves are 49 lines across 10 files — genuinely shallow. The rest is the
  guard the ticket asks for as half the deliverable (394 lines, of which
  roughly 120 are the reasoning for a design that fails if it is wrong) plus
  the manifest and the docs. Worth splitting the guard out of the page pass if
  that is the standing preference.
