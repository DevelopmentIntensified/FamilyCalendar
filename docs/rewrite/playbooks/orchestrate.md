# Playbook: orchestrating the rewrite with subagents

How an orchestrator (a strong model) runs the ledger with cheap implementation agents (owner directive, 2026-11-11). A single agent working alone follows [README.md](../README.md) instead.

## Roles

| role | who | does | never |
|---|---|---|---|
| orchestrator | strong model (Opus) | picks ledger rows, writes briefs, creates worktrees, verifies, commits, merges, pushes, updates the ledger | implements a task itself; it may fix a single trivial line |
| implementer | `deepseek-flash` subagent | edits files for exactly one brief, in its own worktree | runs tests, type checks, formatters, builds or git; touches files outside the brief |
| reviewers | two Opus subagents per task, run in parallel | the `code-review` skill's two axes: **standards** and **spec** | edit code |

## One task

1. **Base.** Create the worktree and install:
   - `git worktree add ../fc-v2-<id> -b rewrite/<id> rewrite/v2`
   - `npm ci` in that worktree
   - record the base sha.
2. **Brief.** The implementer has no other context, so the brief is self-contained:
   - the worktree path;
   - the target paths: at most five files, or one new folder;
   - the change, the patterns to copy (with file paths), and the edge cases;
   - the acceptance criteria the orchestrator will check;
   - the standing rules below, pasted in full.
3. **Implement:** one `deepseek-flash` task.
4. **Verify** (orchestrator only), scoped to the change:
   - `npm run arch && npm run docs:check`;
   - `npm run test:mod -- <m>` for each module the task touched;
   - `npm run test:affected -- <base sha>`: only the tests whose imports reach a changed file, which means the changed module's tests and everything downstream of it. Never the whole suite;
   - `npm run typecheck`.

   Each worktree uses its own test database, so prefix db runs with `V2_TEST_DB=familycalendar_v2_test_<id>`. A red result gets a corrective brief that quotes the failure; repeat.
5. **Commit** on the task branch: `rewrite(<id>): <what>`.
6. **Review.** Two Opus reviewers read `git diff <base>...rewrite/<id>`, in parallel:
   - **Standards:** [rules.md](../../architecture/rules.md), [conventions.md](../../architecture/conventions.md) (including Depth and Performance), [testing.md](../../architecture/testing.md), the module README template, AGENTS.md, plus the `code-review` skill's smell baseline. **Depth** is checked explicitly: does each new public export earn its place (deletion test), and does every invariant live behind the interface rather than at a call site?
   - **Spec:** the brief, the playbook section, the module sheet (Must survive, inventory, Notes) and the answered questions.

   A finding that breaks a documented rule or the spec gets a corrective brief, then verify again, then re-review only the fix commits. For judgement-call smells, the orchestrator decides; the ones not acted on go into the sheet's Notes with a reason.
7. **Merge.**
   - `git merge --no-ff rewrite/<id>` into `rewrite/v2`;
   - repeat step 4 on the merge;
   - `npm run gate:push`, then push;
   - update the ledger row;
   - remove the worktree and `DROP DATABASE familycalendar_v2_test_<id>`.

## Standing rules for every implementer brief

- Work only inside the given worktree path.
- Do not run tests, type checks, linters, formatters, builds or git commands. The orchestrator does all of that.
- Edit only the files the brief lists, plus the module README and the test files it names.
- Never touch `.env*`, `apps/android/**`, `scripts/arch/*`, `vite.config.ts` or `docs/architecture/rules.md`.
- No `vi.mock`, no `any`, no `as unknown as`. Svelte 5 runes only.
- Write the tests the brief asks for before the code, even though you can't run them.
- Every new file starts with a short header comment saying what it is and pointing at its module README.
- End your reply with a list of every file you created, changed or deleted.

## Waves

Tasks run in parallel only when their files are disjoint, apart from README table rows and `package.json` scripts, which the merge resolves. A task that consumes another task's output waits for that merge: types, schema, a harness.
