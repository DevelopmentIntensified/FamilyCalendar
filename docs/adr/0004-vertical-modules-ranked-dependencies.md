# 0004. Vertical modules with ranked dependencies

Status: accepted (2026-11-11)

Code is organised by business area, not by technical layer. Each domain (`src/lib/domains/<name>`) holds the rules, queries, services, HTTP handlers, client state and UI for one concept. Pages that compose several domains live in `src/lib/screens/<name>`.

Domains have a fixed rank (in [registry.mjs](../../scripts/arch/registry.mjs)), and a domain may import only lower-ranked domains. Screens import domains, never each other. `src/lib/app` is the composition root. `npm run arch` enforces all of this, along with public entry files, so a weaker agent cannot drift.

## Considered options

- **Keep layer folders** (`server/db/actions`, `services`, `utils`, `components`). Rejected: one concept is spread over four or more folders today. Tasks alone span `actions/tasks/*`, `services/tasksData`, `utils/task*` and `components/tasks`. Duplication grows because nobody can see the existing copy.
- **Feature-Sliced Design with strict "no imports within a layer".** Rejected: our domains depend on each other in real ways (tasks need family membership; calendar needs family rosters). A rank expresses that, with no cycles.

## Consequences

- When a lower module needs a higher one, the dependency is inverted with a callback, a ctx port or a Svelte snippet. For example, calendar's `EventModal` takes a `checklist` snippet that the screen fills with the tasks checklist.
- Tables are defined in one place (`kernel/db/tables`) because foreign keys cross modules. Ownership is a checked rule: only the owner's repo writes a table, and declared read-only joins are the exception.
