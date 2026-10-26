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

- **Built 2026-10-26** (30834ce): three variants + dispatch + review dock +
  `prototypeProps.ts` in `src/lib/components/dashboard/prototype/`; page
  renders the prototype only when `?variant=` is set and the build is dev
  (`import.meta.env.PROD === false`) — deploys unaffected. Verified in a real
  browser session: variant markers render per variant
  (A: `The day, in order` timeline, B: `Focus hero` + `Where the day stands`,
  C: `Day and household rails`), the dock cycles via ←/→ and `?variant=`,
  and the feedback loop works end-to-end (select → verdict card → note →
  localStorage autosave). Probe mark exercised + cleared.
- Owner review pending (see Needs doing).
