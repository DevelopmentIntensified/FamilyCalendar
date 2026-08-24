# Agent Notes

## Working style

- Delegate to subagents early and often — it is usually faster than doing everything inline. Verify their work afterwards (read the diff, re-run checks).
- Batch independent work into parallel subagent calls.
- Give the user SQL to run manually for schema changes when asked; don't rely only on `drizzle-kit push`.

## Git workflow

- Always run `npm run build` before pushing — never push a broken build.
- Always push to the `test` branch (`git push origin test`), unless the user explicitly says otherwise.

## Domain

See CONTEXT.md for the canonical domain language (Anonymous Account, Claiming, Recurring Task cursor semantics, etc.).
