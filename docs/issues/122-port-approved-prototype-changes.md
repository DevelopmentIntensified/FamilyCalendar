# 122 — Port every approved prototype change into the app

Status: open

Source: owner directive, 2026-09-30 — "after this prototype set of edits, take
them all and build them in the app."

**Blocked by:** 118, 119, 120, and 093/094/095. **Do not start this until the
prototype edits have landed**, so the port copies a settled design rather than
racing it.

## The rule

A prototype is a picture of an idea. This ticket is where the idea becomes the
product. It is deliberately a *separate* ticket from the prototype work, because
they fail differently:

- A prototype that is wrong is a picture nobody looks at twice.
- An app that is wrong is what a family uses every morning.

Porting in the same slice as designing is how a sketch's shortcuts become
production bugs. Design, settle, then port.

## What "all of them" covers

Every mark from prototype review round 2 that is not already shipped. The
already-shipped nine (ticket #121 lists them) are **not** re-ported — doing so
would be re-implementing #096, #097, #103, #077 and #104, and would risk
reverting them.

| From | Marks | Ticket |
|---|---|---|
| Dashboard | board width, kids + groceries layering, shared `daynav` | 118 |
| Calendar mobile | grid is the page, month default, calendars as sheet, by-person as filters, overdue gone, Up Next gone | 119 |
| Calendar toolbar | one centred date control, search on row two | 120 |
| Stats | remove the why-card, reorder, equalise heights | 093 |
| Archive | month card padding | 094 |
| Icon | synthesis should read as a calendar | 095 |

## Needs doing

- [ ] **Re-read each ticket's `## Done` before porting it.** A ticket may have
      been closed as superseded, or its fix may have landed in the prototype
      work by accident. Verify, do not assume.
- [ ] **Prototype E is the source for 119/120, not D.** D is the historical
      record. Porting from D would re-import three rounds of rejected layout.
- [ ] Each port is a TDD slice: the failing test describes the app behaviour
      the mark asked for, not the prototype's markup.
- [ ] **Reuse, do not re-skin.** The app already has a real toolbar, a real
      grid, a real dashboard band. The prototype supplies arrangement and
      intent. Where the app's component already does the job better, keep it and
      say so in the report.
- [ ] Any place the prototype's approach is worse in the real app — it has no
      loading states, no empty states, no error paths, no real data volume —
      **the app wins, and the difference is recorded in the ticket.** A prototype
      is not a specification for edge cases.
- [ ] Update `prototypes/app-check.mjs`-derived expectations if a port changes
      the data model. Every expectation there is derived from `schema.ts` and the
      nav tables, so it fails when reality moves — that is the point.
- [ ] `CONTEXT.md` gains an entry for anything that turned out to be a new domain
      concept rather than a layout change. Most of this is not, and that is fine.

## The bar for "ported"

Not "the pixels match". A mark is ported when the **behaviour it complained
about** cannot recur:

- 119: the rail cannot render below 768px — pinned by a test, not by CSS alone.
- 120: search cannot sit on the first row — pinned by a test.
- 118: the board cannot be full-width — pinned by a test.

A test per mark. Thirty-five marks would be absurd; the eleven that describe
real work get one each.

## Notes

- UI feedback rules in `AGENTS.md` bind every port: ack under 100ms, confirm via
  toast or inline status naming what happened and what is next, no bare
  `alert()`, skeletons rather than blank cards. The prototypes have none of
  this, so it is all new work.
- The icon mark (095) is a brand asset, not a component. It goes through
  `scripts/build-brand-rasters.mjs` and lands in `static/brand/`. It is the one
  port in this ticket that touches files another agent may also be generating —
  coordinate rather than collide.
