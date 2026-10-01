# 116 — 26 suites mock the database module; that count is the seam report

Status: open

Source: architecture review, 2026-09-30, candidate #9. Explicitly deferred work —
`AGENTS.md` records a real-Postgres harness as future work (#002).

**Blocked by:** #002. Do not start this before the harness ticket has a plan.

## The finding

`vi.mock('$lib/server/db')` appears in **26 suites**, and **12 of them live
inside `src/lib/server/db/actions/`** — the modules whose own interface is
being mocked away.

The database is a **hard singleton** reached by module-level import. So the only
way to test a query is to mock the thing underneath it. The tests still pass, and
they are still nearly worthless for the thing that matters.

## What it costs

`toggleTaskComplete.test.ts` spends **25 lines of drizzle stub on a 12-line
decision**, plus a 21-field row factory whose only purpose is satisfying the
shape.

## What it hides — this is the expensive part

A mock asserts **the shape of the call**, never behaviour under concurrency. So
these are untestable at any cost today:

- the guarded **double-click race**
- the **batched cursor update**
- the **transactional undo**

Those are exactly the rules most likely to be wrong, and exactly the ones the
task board (110) is about. Fixing 110 without this means shipping logic that
still cannot be verified under the conditions that break it.

## The precedent already exists

`events.creatorNames.test.ts` is written differently from its siblings. It is the
one place someone found a real seam. **Read it before designing anything** — it
is a working example, not a proposal.

## Needs doing

- [ ] Read `events.creatorNames.test.ts` and name what made its seam work.
- [ ] A plan for the harness, filed against #002. Not the harness itself.
- [ ] One representative query module moved to the real seam as a pilot, and the
      test written twice — mock and real — so the difference is visible.
- [ ] The double-click race gets a test the moment any of this is unblocked.
- [ ] Triage the 26: which mock the DB, and which mock *the module under test's
      own dependencies*? Those are not the same smell and should not be counted
      together.

## Done

## Notes

- The Standards review independently counted this and reached the same number.
  Two passes, same answer.
- Until this lands, treat every test in `db/actions/` as a test of *the shape of
  the query*, not of the query. Say so when quoting coverage.
