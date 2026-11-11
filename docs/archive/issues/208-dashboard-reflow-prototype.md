# 208 — Dashboard reflow: three-variant live prototype on /calendar/dashboard

Status: in-progress

Source: owner 2026-10-25 — "we need a dashboard page redesign/reflow. prototype".

## Question

Is the day dashboard's current arrangement (info band → day band: glance /
top-3 / completed → family row: board / kids / groceries) the right reflow, or
does a different hierarchy read better as a morning read?

## Approach (prototype skill, UI branch, sub-shape A)

Three **structurally different** variants rendered on the LIVE route
`/calendar/dashboard`, switchable via `?variant=A|B|C` with a floating dock
(prev/next + arrow keys + URL-replace), plus a section-feedback overlay
(good/bad/idea verdicts, autosave to localStorage, Copy-to-chat). Dev-gated:
`import.meta.env.PROD` builds (test + prod deploys) never render the chrome —
the owner runs `npm run dev` locally to review.

Variants disagree about STRUCTURE, not colour:

- **A · Morning Read** — one chronological column: a slim stat strip (not a
  card) for glance numbers, then events + kids' schedule merged into one
  time-ordered reading, then board, then groceries.
- **B · Focus First** — top-3 promoted to a hero band; glance as inline stats;
  completed demoted into the hero footer; kids + groceries in a compact
  household rail.
- **C · Board First** — family board full-width anchor at top (revisiting
  #118's narrowing), day reading compressed to a left rail, kids + groceries
  right rail.

All three reuse the existing card components and the same data props the page
already loads — read-only, no mutations.

## Needs doing

- [x] Build variants + switcher + feedback overlay, dev-gated.
- [x] Serve locally; hand the owner the URL + variant keys.
- [ ] Owner review (feedback overlay marks) → pick winner or synthesize.
- [ ] Fold winner into DayDashboard; move all variants to a throwaway branch.

## Done

- **Round 1 REJECTED 2026-10-26 (owner verdict):** the three variants removed
  parts of the dashboard and read as bare wireframes — the hand-rolled stat
  strips and thin rails replaced real cards, and the arrangements solved
  nothing. Round-1 files kept only in git history (30834ce).
- **Round 2 built 2026-10-26** — same `?variant=A|B|C` dock, three FULL
  treatments (every module renders as its real card, nothing removed):
  **A · Split Paper** — schedule main column (glance + kids), actions rail
  (top3, completed, board, groceries); **B · Zoned** — three named zone rows
  (The day / Actions / Household), cards paired inside; **C · Rhythm** — the
  shipped 3+3 arrangement kept with one visual system: polished KPI bar
  (numbers + next event), equal-height rows. Verified in a real session:
  all three render their structure, dock cycles, 320px has no horizontal
  overflow on any variant.
- **Round 3 (2026-10-26, owner direction: "3 is best, but integrate the way
  things look")** — variant C rebuilt as **Rhythm, Integrated**: same
  arrangement, internals unified into ONE system — unboxed rows everywhere
  (the glance row style became THE row style), one group-header form (avatar
  chip + name + count, the board's own, now on top-3/kids/groceries too),
  header counts right-aligned on every card, one footer style (bottom-right
  primary link, only where navigation exists), emoji badges (📍🔒🌐) replaced
  with text chips, the completed card's lone 2xl number demoted into its
  header count. Real-card chrome differences are the explicit target of the
  round; interactions stubbed with a visible prototype notice.
- Owner review pending (see Needs doing).
