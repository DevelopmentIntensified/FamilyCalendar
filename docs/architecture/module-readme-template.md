# Module README template

Every module folder (`src/lib/kernel`, `src/lib/app`, `src/lib/domains/<name>`, `src/lib/screens/<name>`) has a `README.md` built from this template. `npm run new:module -- <name>` fills in the `{{placeholders}}` for you. `npm run docs:check` enforces two things:

- **D1**: all six `##` sections below are present.
- **D2**: the Files table links every file in the folder, tests included. A file that isn't in the table fails the check, and so does a link to a file that no longer exists.

How to write it:

- Prefer tables to prose, one line per file. A reader should know what a file does, why it exists and which test pins it without opening the file.
- "Why" means the reason the code is shaped this way: the domain rule, the ticket, the incident. Don't restate what the code does.
- Use the domain words from [CONTEXT.md](../../CONTEXT.md) exactly.
- Update the README in the same commit as the code. A stale README is a bug.

```markdown
<!-- template:begin -->
# {{name}}

**{{kind}}** — {{purpose}}

Domain words come from [CONTEXT.md]({{up}}/CONTEXT.md); use them exactly. Architecture rules: [docs/architecture/rules.md]({{up}}/docs/architecture/rules.md).

## Purpose

- Owns: (2-4 bullets in domain words)
- Does not own: (what a reader might expect here, and which module has it)

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Public isomorphic interface: contract types, rules, client api. | — |
| [index.server.ts](index.server.ts) | entry | Public server interface: services and http handlers. | — |
| [ui/index.ts](ui/index.ts) | entry | Public components. | — |

## Public interface

Everything other modules and routes may use, grouped by entry file. One line each: `name` — what it does.

- `index.ts`:
- `index.server.ts`:
- `ui/index.ts`:

## How to test

- Whole module: `npm run test:mod -- {{name}}` (add `--legacy` while legacy tests remain).
- Pure rules: `*.rules.test.ts`, plain tables of input → expected output, no setup.
- Database + services: `*.db.test.ts` using `rollbackTest` and `testCtx({ db })` (needs Postgres: `docker start familycalendar-db`).
- HTTP contract: `{{name}}.http.db.test.ts` pins status + body of every endpoint (golden tests).
- UI: `ui/*.svelte.test.ts` render with props; state classes are tested without a DOM.
- Fixtures: `{{name}}.fixtures.server.ts` (list builders here).

## Invariants

Behaviour that must not change, each with the test that pins it (`file › test title`):

-

## Depends on

- May import: {{mayImport}}.
- Owns tables: {{tables}}.
- Reads (join only): none.
- Calls: (other modules' services this one uses, and why)
- Called by: (who uses this module's public interface)
<!-- template:end -->
```
