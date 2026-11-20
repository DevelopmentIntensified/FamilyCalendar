# Playbook: orchestrating the rewrite with subagents

How an orchestrator (a strong model) runs the ledger with cheap implementation agents (owner directive, 2026-11-11). A single agent working alone follows [README.md](../README.md) instead.

## Roles

| role | who | does | never |
|---|---|---|---|
| orchestrator | strong model (Opus) | picks ledger rows, writes briefs, creates worktrees, verifies, commits, merges, pushes, updates the ledger | implements a task itself; it may fix a single trivial line |
| implementer | `deepseek-flash` subagent | edits files for exactly one brief, in its own worktree | runs tests, type checks, formatters, builds or git; touches files outside the brief |

## One task

1. **Base.** Create the worktree and install:
   - `git worktree add ../fc-v2-<id> -b rewrite/<id> rewrite/v2`
   - `cp -al ../fc-v2/node_modules ../fc-v2-<id>/node_modules` (hard links: seconds of metadata instead of an `npm ci` per worktree; many parallel `npm ci` runs saturate the disk)
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
6. **No review step** (owner decision, 2026-11-18). No reviewer subagent reads the diff, and `grok-reviewer` is not used at all. Step 4's verify is the merge gate, so the brief carries the whole spec:
   - expected values come from legacy code and the frozen goldens, never from running the new code;
   - the implementer re-reads each file it wrote against the module README Invariants before reporting;
   - the standards are [rules.md](../../architecture/rules.md), [conventions.md](../../architecture/conventions.md) (including Depth and Performance), [testing.md](../../architecture/testing.md) and the module README template.

   A deviation or legacy quirk the work surfaces still goes to [questions.md](../questions.md), as an open question or a recorded default.

   Rate limits and load (owner decisions, 2026-11-12):
   - When `deepseek-flash` answers 429, rerun the same brief on `sonnet-impl` (Claude Sonnet).
   - At most four subagents run at once.
   - Heavy local checks (typecheck, test runs, builds, Playwright) run one at a time at below-normal CPU priority, so the owner's machine stays responsive.
7. **Merge.**
   - `git merge --no-ff rewrite/<id>` into `rewrite/v2`;
   - repeat step 4 on the merge;
   - `npm run gate:push`, then push;
   - update the ledger row;
   - remove the worktree and `DROP DATABASE familycalendar_v2_test_<id>`.

## Standing rules for every implementer brief

- Work only inside the given worktree path, and always use absolute paths under it: a relative path resolves to the main checkout.
- Do not run tests, type checks, linters, formatters, builds or git commands. The orchestrator does all of that.
- Edit only the files the brief lists, plus the module README and the test files it names.
- Never touch `.env*`, `apps/android/**`, `scripts/arch/*`, `vite.config.ts` or `docs/architecture/rules.md`.
- No `vi.mock`, no `any`, no `as unknown as`. Svelte 5 runes only.
- Write the tests the brief asks for before the code, even though you can't run them.
- Every new file starts with a short header comment saying what it is and pointing at its module README.
- End your reply with a list of every file you created, changed or deleted.

## Waves

Tasks run in parallel only when their files are disjoint, apart from README table rows and `package.json` scripts, which the merge resolves. A task that consumes another task's output waits for that merge: types, schema, a harness.
