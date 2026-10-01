# 110 — Task visibility rules and the Recurring Task cursor: the invariant lives at the call site

Status: open

Source: architecture review, 2026-09-30, candidate #1 — the largest prize.

**Blocked by:** None, but the largest of the nine. Read 109 first if you want
the pattern; they are the same shape in two domains.

## The finding

Two dead exports prove the seam has already moved out from under its callers:

- **`canChangeVisibility` exists and is never called in production.** The real
  rule is re-typed inline at `api/tasks/[id]/+server.ts:103` as
  `existing.userId !== user.id → 403`.
- **`getFamilyTasksAssignedTo` is likewise dead.**

And one invariant is a *call before a read*, repeated by hand in **five
loaders**:

```\nsyncRecurringCursors(...)
then read the list
```

**A sixth view that forgets stops pinning overdue Recurring Tasks. No error.
Just quietly wrong data** — the kind of bug that surfaces as a user complaint
months later with nothing to trace.

There is also a rule expressed as a side effect of a return value: `tasks.ts:166`
infers "maybe the caller wasn't the owner" from a falsy result.

## Needs doing

- [ ] **The cursor pin stops being something a loader remembers.** Reading a
      Task list must not be possible in a state where the pin has not happened.
      A function that a caller can call in the wrong order is not an interface,
      it is a convention — and the convention has already been copied five times.
- [ ] **One question, one answer:** *may this actor complete / edit / reassign
      this Task, and what does that do to the cursor?* Cursor arithmetic, history
      writes, assignment state, and the visibility rules all sit behind it.
- [ ] The two dead exports either get **called** or get **deleted**. An export
      that exists solely to document a rule someone then retyped is worse than no
      export, because the next reader trusts it.
- [ ] The falsy-return-means-not-owner inference gets replaced by a question the
      caller can ask. Same shape as 109.
- [ ] Pin the call-before-read order with a test that fails if a new list-reading
      path skips it. The mechanism matters less than that forgetting is now
      *detectable*.

## The test story

Six near-identical suites today, five mocking the DB. `toggleTaskComplete.test.ts`
is 25 lines of drizzle stub to test a 12-line policy, plus a 21-field row
factory whose only job is to satisfy the shape the interface demands. The
policy should be a table over plain objects with no mock at all.

## The deletion test

`syncRecurringCursors` earns its keep — deleting it moves the rule into N
loaders. But it is a **call, not a seam**. The two dead exports are pure dead
weight: deleting them makes complexity vanish.

## Done

## Notes

- The double-click races, the batched cursor update and the transactional undo
  are untestable while the DB is mocked underneath (see 117). If the seam lands
  first, those become testable and should be tested.
- Do not let this ticket's size push it past review. If it splits, the natural
  seam is: cursor invariant first, authorization predicate second.
