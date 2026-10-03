# 123 — Build the approved pages into the app

Status: in-progress

Source: prototype review cycle 1 approvals, 2026-09-30 — **16 pages approved**
(15 app-ui plus **Prototype E**).

**Blocked by:** Nothing.

## Owner directive, 2026-09-30

> "all approved pages need to be built into the real app"

This supersedes the framing below. The question is no longer *does the app
already match* — it is **build every approved page, and close the gap against
the prototype wherever one exists.** The "already shipped" column stays because
it tells the porter where **not** to re-implement, but a match is not an
excuse to skip a page. Each page gets read, compared, and the difference
closed or recorded as a deliberate divergence with a reason.

**Prototype E is approved and its app work is already shipped** (#119/#120:
month default on narrow, search on the second row, shared `DayNav`). What
remains open from it is **By Person as filter buttons** — mark 1.11 asked for
it, the app has no per-member filter, and the earlier lane flagged it rather
than inventing one. Under this directive it gets **built** as a real assignee
filter, not left as a note.

## The approvals

| Page | Question it answers | Already in the app? |
|---|---|---|
| `app-ui/account.html` | settings, consent | yes — 088/088b added the ad control the prototype lacks |
| `app-ui/archive.html` | is the archive worth a gate | yes — layout differs; #094 owns the card padding |
| `app-ui/b-tasks-flat.html` | one flat list, no bands | **yes — #101 shipped exactly this** |
| `app-ui/dashboard.html` | day at a glance | yes — #118 owns the current layering |
| `app-ui/event.html` | the event modal | yes |
| `app-ui/family-create.html` | create a family | yes — #075/076 shipped it |
| `app-ui/family-detail.html` | 793 lines, one job | yes — #077 shipped the band split |
| `app-ui/family-invitations.html` | invitations | yes — #091 is still open against it |
| `app-ui/family-members-add.html` | add a member | yes — member search shipped |
| `app-ui/family-tasks.html` | the family task list | yes — #101 |
| `app-ui/family.html` | the family hub | yes — #064/078 |
| `app-ui/groceries.html` | group by store | yes — #096/#097 |
| `app-ui/import.html` | import | yes — #082/083 still open |
| `app-ui/notifications.html` | alerts | yes — #073 shipped the grouping |
| `app-ui/stats.html` | does history earn a page | yes — #093 owns the current layout |

**Read that last column before writing a line of code.** Eleven of fifteen are
already in the app. This is largely a *verification* ticket, not a build ticket,
and the most valuable thing it can produce is a list of where the app and the
approved page genuinely disagree.

## What "approved" means here — corrected

**An approval is a specification, not a comparison.** The first round treated
"the app is already better" as an acceptable outcome and changed nothing. That
was the wrong call and it was mine, not the agents' — the brief offered three
outcomes and the second one was a loophole. Corrected per the owner, 2026-10-03:

> "no, if I approved the prototype, keep the way it looks and rebuild the page
> using that look and function"

The rule now:

- **The approved prototype is the spec for BOTH appearance and function.** Build
  the page the way the prototype looks and behaves. Do not substitute your own
  judgement about which version is better.
- **Where the prototype shows something the app lacks, build it.** A plan bar, an
  invitation summary, a "Nobody" group, a search on the chip line, attendance
  proportions — these were declined as "new product" or "already better", and
  they are what was approved.
- **Do not delete real capability to match the picture.** A prototype has no
  loading, empty or error state, no real data volume and no authorisation
  checks. Adding the prototype's layout is the work; *removing* a grouped query,
  an empty state or an authz gate is not, and is not asked for.
- If a prototype element genuinely cannot be built — no data exists to build it
  from — say so with the reason and stop. Do not quietly substitute something
  else and call the page done.

Still true: cycle 1's marks are archived in
`docs/research/review-marks-cycle-1.md` and triaged into #093, #094, #095, #118,
#119, #120 — that record is a record, and archiving it did not discharge them.

## Needs doing

- [ ] **Diff each approved page against its app counterpart.** Three outcomes per
      page: already matches, app is better (record why, change nothing), or a
      real gap (that is a new ticket, not work for this one).
- [ ] **Do not re-implement shipped work.** #101, #096, #097, #075, #077, #073
      are done. Porting them again risks reverting them.
- [ ] **Where the app is better, say so and leave it.** A prototype has no
      loading states, no empty states, no error paths, no real data volume. A
      page that looks simpler usually is.
- [ ] Every genuine gap gets its own numbered ticket with the prototype's
      intent quoted. Not folded in here.
- [ ] Update `review.json`: approved pages move to `approved` with a note, and
      the `note` records where the work went — the check (§6) requires a
      destination for every reviewed page.
- [ ] Close #121 by making the check that stops a prototype drifting again. This
      ticket is the last chance to notice the drift, because it is comparing all
      fifteen pages to the app.

## The check that must pass

`node prototypes/review-check.mjs` and `node prototypes/review-check.mjs` must
both be clean with all fifteen approved pages recorded. Right now the registry
says `unreviewed` for pages the review tool says are approved, and six checks
fail on exactly that. **That reconciliation is the first thing this ticket does.**

## Notes

- The app is the deliverable. The prototype is the argument for it.
- If this ticket's honest output is "11 pages already match, 3 gaps, 1 prototype
  was wrong about the app", that is a good outcome and should be written down
  plainly rather than padded with ports nobody needed.
