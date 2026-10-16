# 113 — `tasks.ts` is 959 lines and 33 exports: six modules pretending to be one

Status: open

Source: architecture review, 2026-09-30, candidate #5.

**Blocked by:** Best done after 110, which decides the shape of the
authorization and cursor seam. Doing this first risks splitting a seam that is
about to move.

## The finding

| Concern | Lines | Exports |
|---|---|---|
| Recurring Task cursor (v3 policy, undo) | ~250 | 6 |
| Assignment / Requested–To-Accept state | ~135 | 3 |
| Visibility queries (7 near-identical) | ~230 | 7 |
| Tag fan-out (attach + 4 inline pairs) | ~60 | 2 |
| Authorization predicates | ~90 | 2 |
| Public type bag for consumers | ~20 | 1 |

Six unrelated reasons for one file to change.

## The tell

`sectionSelect` — the file **tries** to be a shared query abstraction and
**stops halfway**. Two of the seven list queries don't use it. And
`getTasksForUser` adds `eventCalendarId` on its own, so:

> The calendar filter added last week is available on **exactly one of the
> seven** list queries.

That is a bug already, waiting for a user who filters the calendar and then opens
a different view. It is not hypothetical.

## Needs doing

- [ ] **Either the abstraction is finished or it is deleted.** Half-used is the
      worst state: it advertises a shared shape it does not deliver.
- [ ] `eventCalendarId` reaches **all** list queries, or is deliberately absent
      from all of them. Pin with a test per query.
- [x] Split by the six concerns above. Each piece should *concentrate* — the
      deletion test, not a line count.
- [x] The public type bag stays a type bag. Consumers should not import the
      implementation to get a shape.
- [ ] The 7 near-identical visibility queries are the highest-value merge: seven
      copies of one filter shape is seven chances to have got the join wrong.

## The deletion test

Do not delete this module — split it. Each piece concentrates, which is the
signal that the file already knows it should be several. The half-used
`sectionSelect` is the proof.

## Done

- 2026-10-16: split performed (`src/lib/server/db/actions/tasks/`): `types.ts`
  (public shape bag incl. the `TASK_VISIBILITIES` re-export), `cursor.ts`,
  `auth.ts`, `tags.ts`, `queries.ts`, `assignment.ts`, `mutations.ts`, with
  `index.ts` as the barrel — the public export surface is unchanged, so loaders
  and api routes need zero edits. Colocated suites moved with their modules.
  **Honesty note:** this pass moved the seams without moving the seams'
  design — `sectionSelect` is unused by two of the seven list readers and
  `eventCalendarId` still reaches only `getTasksForUser`; those two items stay
  open deliberately (no behavior changes were in scope for the split).

## Notes

- 33 exports is not itself the problem. 33 exports *across six concerns* is.
- If a split turns out to be pure file-shuffling with no seam change, that is a
  failed refactor. Say so here rather than shipping it.
