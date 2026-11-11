# Playbook: when stuck

## Stop and ask, don't guess, when

- a golden test fails after S6 and two attempts have not found the difference;
- the port seems to need a different API response, a schema change, a new migration, or a change to an arch or docs rule;
- legacy behaviour looks wrong but the sheet doesn't mark it **FIX-IN-PORT**;
- the right home for a piece of code is unclear: the census NOTE doesn't cover it, and the rules allow two answers;
- `npm run gate` is red for a reason outside your module, before you changed anything;
- the database or Docker is unavailable, or a command needs secrets you don't have;
- a task would edit `apps/android/**`, `.env*`, or production data.

## How to ask

1. Append to [questions.md](../questions.md):

   ```markdown
   ## Q-NNN <short title> (<task id>, <date>)
   Context: what you were doing and what you found (paths, test names, output).
   Options:
   A. … cost: …
   B. … cost: …
   Recommendation: A, because …
   ```

2. Set the ledger row to `blocked` and link the question.
3. Commit and push, then stop the session. Do not start another task that depends on the blocked one. An independent `todo` task is fine.

Never invent a third option the question doesn't list, and never "temporarily" weaken a check. The owner rule is: a genuine fork goes to the owner as options with costs.

## Debugging moves before asking

- Run one test: `npx vitest run <file> -t "<title>"`.
- Find what depends on a file: `npx vitest related <file> --run`.
- Compare a legacy and a new response field by field: print `res.body` in the golden test temporarily, then remove the print.
- Re-read the rule that fired (`docs/architecture/rules.md#rN`). The message names the fix.
- Run `npm run census -- <m>` for the split notes and importer counts.
- Look up a domain word in [CONTEXT.md](../../../CONTEXT.md).
- Run `git log -S "<identifier>" --oneline` to find the commit that introduced a behaviour, and read its message.
