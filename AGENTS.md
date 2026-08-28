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

## NLP changes (natural-language parsing)

- Any change to natural-language parsing (`naturalLanguageService.ts`, quick-add/date parsing, new keywords like task priority) MUST be test-driven (`tdd` skill) with a table-driven suite covering as many distinct phrasings, colloquial variants, and word orders as possible.
- Keep the existing parser coverage green — `src/lib/server/services/naturalLanguageService.test.ts` currently carries ~94 phrase tests; treat it as the floor, not the ceiling. New input surface (e.g. priority keywords) gets its own exhaustive phrase table.
- Exercise the full pipeline where a seam exists (phrase → parsed intent → server action), not just the regex/parser unit.

## Testing on test.familyplanz.com

- The `test` branch auto-deploys to https://test.familyplanz.com. After pushing, wait ~1 minute for the deploy before testing.
- Vercel MCP tools are available (Code Mode): check deploy status (`list_deployments`, `get_deployment`), fetch deployment URLs, and bypass deployment protection (`get_access_to_vercel_url`). Use them when the live site is unreachable or to confirm which commit is deployed.

## Svelte MCP server

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

## Domain

See CONTEXT.md for the canonical domain language (Anonymous Account, Claiming, Recurring Task cursor semantics, etc.).
