# 101 — Family tasks: the approved board does not exist yet

Status: done

Source: `app-ui/family-tasks.html` review, prototype approved (no marks). The
approved design is one column per person, overdue first inside each column,
with unassigned tasks given a home.

**Blocked by:** 098 (the page rendered whichever family the first membership row
names). 098 landed as `3c6c32b`; this ticket then built the board on top.

**Decided here, by the owner, as one slice** (both touch the same surfaces):
the Family Task Board groups by assignee on _both_ surfaces, and the personal
tasks list goes flat.

## Done

- [x] The page groups open tasks into one column per person. `/family/tasks`
      renders `grid-cols-1 sm:grid-cols-2`, viewer first then by name, and the
      column header carries the person plus their open-task count.
- [x] Inside each column, overdue tasks sort to the top. The grouping is by
      person; the urgency inside it is by date (overdue → today → up next, by
      due date, undated last).
- [x] Unassigned tasks get their own home — **and the home is the creator's
      column**, not an "Unassigned" heading. See the decision below.
- [x] Empty columns do not render, and a family with no open tasks says so
      rather than rendering a grid of nothing.
- [x] The column header carries the person, and the grid steps down sanely on a
      phone — one column, then two, rather than a horizontally scrolling board.
      Verified at 320px and 375px by `e2e/family/MobileLayout.test.ts`.
- [x] Everything the page already does survives: the two list tabs, the tag
      filter, the waiting-for-your-response banner, the completed list, the
      owner-only edit dialog, complete/advance/accept/decline, and delete with
      its confirmation.
- [x] Tests: grouping by assignee, the creator fallback, a member with nothing
      assigned, empty input, viewer-first ordering, overdue-first inside a
      column, and the tag filter interacting with the grouping (the filter runs
      before the grouping, so a filtered-out task leaves no column behind).

### Decision 1 - the board groups by assignee, falling back to the creator

> **Superseded in part, 2026-10-03 (issue 124).** The owner approved
> `prototypes/app-ui/family-tasks.html`, which shows an "Nobody" card for Tasks
> with `assigned_to IS NULL` instead of filing them under the creator. An
> approval is a specification, so the **family tasks page now renders that card**
> and its board is fed only the Tasks that genuinely have an assignee — no task
> appears twice, and an unassigned one is neither invisible nor misattributed.
> The shared `groupTasksByAssignee` keeps its creator fallback for the **dashboard
> card**, which is a different surface and still shows one column per person.
> The reasoning below stands as history: the trade-off was named honestly, and
> the owner has now answered it with a layout rather than with a rule.

`CONTEXT.md` defines the Family Task Board as "grouped by assignee (falling
back to the creator when a Task is unassigned)". The rule now lives in one
module, `src/lib/utils/familyTaskGroups.ts` — `boardOwnerId` returns
`assignedTo ?? userId` — and both surfaces call it:

- the dashboard card, `src/lib/components/dashboard/FamilyTaskBoardCard.svelte`
- the family tasks page, `src/routes/(family)/family/tasks/+page.svelte`

Two surfaces with one name must not grow two shapes; that mismatch is what made
the prototype's premise wrong in the first place.

**The unassigned bucket and the creator fallback are not both shipped.** The
creator fallback wins, and it wins deliberately: the owner picked the documented
language over a visible unassigned bucket. The cost is honest — the board no
longer says "nobody is assigned to this" — and the win is that an unassigned
Task still has a person who answers for it instead of sitting in a bucket the
family cannot act on.

The dashboard card already grouped by this rule (it printed a heading and a
count per person); it now gets its grouping from the shared module, so its
per-member open-task count survives the reflow and gains overdue-first ordering
inside each column.

**Not in this ticket:** `/family/[familyId]/tasks` still renders the old
shape through `FamilyTasksList.svelte`, including its own "Unassigned" bucket.
That is the near-duplicate route 098 was to remove or repair; it is out of
scope here, and it is the one remaining place where two task surfaces disagree
about what unassigned means.

### Decision 2 — the personal tasks list goes flat

Per `prototypes/app-ui/b-tasks-flat.html`, built at 150 tasks and approved: no
Overdue / Today / Up next bands, one continuous list, time as a **filter
state** rather than a section.

- [x] `TasksMainList.svelte` renders one run of rows. The `Open (n)` and
      `Completed (n)` band headings are gone, and there is **no sticky group
      header** — a running header would re-create the bands it replaced.
- [x] The urgency rule, in order: **every finished Task after every open one,
      whatever the sort key says; otherwise overdue → today → up next, then by
      due date, undated last.** It is one comparator, `sortFlatTasks`.
- [x] Each row carries its own state: an overdue row washes red and prints
      `1 day late` / `N days late` beside its date (`TaskRow.svelte`).
- [x] A jump bar carries the counts the headings used to print — `All n ·
  Overdue n · Today n · Up next n · Done n` — and clicking one filters the
      list. When a bucket is empty the list says so and offers a way back.
- [x] The filter/search/sort row still works, and the assignment inbox
      (`AssignmentsCard`) is untouched: it is a separate band by design.
- [x] The sort control keeps all four existing options and gains **Urgency**,
      now the default. Each sort is an absolute override, as in the prototype:
      pick A–Z and you get A–Z, and the row's own date is what still says
      "late". A user's saved choice is not overwritten.
- [x] "Clear completed" moved off the band heading it lived under to a
      list-level control, with the same two-step inline confirm, so nothing
      was lost with the heading.

**Known trade-off, stated because the prototype states it:** flat cannot show
the shape of the queue at a glance. A heading is a summary; a chip is a door.
The jump bar carries the counts, and the owner took the door.

## Needs doing

- [ ] 098 removes or repairs `/family/[familyId]/tasks`, which still renders a
      different board with an "Unassigned" bucket. Until then the repo holds
      three shapes for "the family board".

## Notes

- **The prototype's own premise about the app is false, and it changes how this
  ticket should be read.** The page describes the real page as already
  "grouping by assignee" and argues only about ordering within the group. It
  does not group at all — except on the dashboard card, which does. So on the
  family tasks page this was the first grouping the page had ever had; on the
  dashboard card it was a reflow onto shared code. The design argument still
  held; the description of the starting point did not.
- **The canonical domain language was ahead of the code, in the same
  direction.** It defined the board as "grouped by assignee (falling back to
  the creator when a Task is unassigned)" when only the dashboard card came
  close. Resolved above.
- **New seams, so the two rules are testable rather than re-typed per surface:**
  - `src/lib/utils/familyTaskGroups.ts` — `boardOwnerId`, `groupTasksByAssignee`
  - `src/lib/utils/taskUrgency.ts` — `urgencyBucket`, `compareUrgency`,
    `lateChip`, `sortFlatTasks`, `bucketCounts`, the jump-bar labels
  - `taskSort.ts` gained `'urgency'` as a `TaskSortKey` so the sort control can
    offer it without a second vocabulary.
    `priorityTone.ts` grew `isDueToday` (it already had that logic, private) so
    "today" has one definition, and both `isOverdue`/`isDueToday` now accept a
    `Date` as well as an ISO string.
- **"Due date" and "Urgency" order identically for open Tasks.** Overdue tasks
  are the past, so ascending due date already puts them first, then today, then
  what is next, undated last. Urgency is the same order with the buckets named,
  which is what the jump bar filters on and what the old headings printed.
- **`sortFlatTasks` keeps finished work last under every sort key.** Without it
  a Task completed today from last month's due date opens the list. This is
  structural, not a band: the list is flat, but finished work is not work.
- **Two e2e specs were stale, not broken by this ticket, and are updated rather
  than deleted.** `e2e/mobile/MobileSmoke.test.ts` still targeted the old
  `<input>` quick-add and `press('Enter')`; the composer is a `MentionInput`
  (`<textarea>`) whose Enter belongs to the @mention menu, so the spec now
  clicks Add. It also gained a 320px overflow check for the new jump bar.
  `e2e/family/MobileLayout.test.ts` (the 320/375px family-pages check) was
  already correct and passes unchanged.
- Do not build this on the near-duplicate route. It is the one that crashes on
  load; 098 removes or repairs it.
