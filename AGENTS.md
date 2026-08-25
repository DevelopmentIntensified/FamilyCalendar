# Agent Notes

## Working style

- Delegate to subagents early and often — it is usually faster than doing everything inline. Verify their work afterwards (read the diff, re-run checks).
- Batch independent work into parallel subagent calls.
- Subagents doing implementation work should follow the `tdd` skill (red-green-refactor; tests first where a seam exists).
- Research subagents should move fast: breadth-first, skim, report file:line evidence — don't over-verify.
- Default to caveman style (terse, no filler) in replies; drop it when the user asks for an explanation.
- Give the user SQL to run manually for schema changes when asked; don't rely only on `drizzle-kit push`.

## Answering unknowns

- **Control mode** (user driving, answering questions): when the answer isn't in the docs or code, use the `grill-with-docs` skill to ask — never guess.
- **Hands-off mode** (user AFK or says "grind"/"continue"): make assumptions based on CONTEXT.md, docs/, and past answers; list all assumptions at the end for confirmation.

## Git workflow

- Always run `npm run build` before pushing — never push a broken build.
- Always push to the `test` branch (`git push origin test`), unless the user explicitly says otherwise.

## Testing on test.familyplanz.com

- The `test` branch auto-deploys to https://test.familyplanz.com. After pushing, wait ~1 minute for the deploy before testing.
- Use the playwright-cli skill to drive the live site and verify changes in a real browser (open, snapshot, click/fill, console, network).

## Domain

See CONTEXT.md for the canonical domain language (Anonymous Account, Claiming, Recurring Task cursor semantics, etc.).
