# Docs map

Every live document, what it is for, and when to read it. Start from [AGENTS.md](../AGENTS.md). Read only the row your task needs. Each document links onward to what it depends on.

## Always relevant

| doc | what | read when |
|---|---|---|
| [AGENTS.md](../AGENTS.md) | hub: working rules + routing table | every session |
| [CONTEXT.md](../CONTEXT.md) | domain glossary (Anonymous Account, Claiming, Recurring Task cursor, …) | a domain word is unclear |

## Website and server architecture

| doc | what | read when |
|---|---|---|
| [architecture/README.md](architecture/README.md) | design choices, layers, module anatomy, request flow | before changing `src/` |
| [architecture/rules.md](architecture/rules.md) | rules R1–R15 (`npm run arch`) and D1–D4 (`npm run docs:check`) | a check failed |
| [architecture/conventions.md](architecture/conventions.md) | file roles, signatures, errors, validation, UI, and the "one home per concept" table | writing code |
| [architecture/testing.md](architecture/testing.md) | vitest projects, commands, test kinds, golden tests, gates | writing or running tests |
| [architecture/modules.md](architecture/modules.md) | generated module catalog: rank, tables, purpose | finding which module owns something |
| [architecture/module-readme-template.md](architecture/module-readme-template.md) | the README every module has | creating a module |
| `src/lib/**/README.md` | one per module: files, interface, tests, invariants | working inside that module |
| [adr/](adr/) | decisions and their reasons (0001 roles; 0002 auth; 0003–0009 rewrite) | questioning a design choice |

## The v2 rewrite (in progress)

| doc | what | read when |
|---|---|---|
| [rewrite/README.md](rewrite/README.md) | start here: setup, the task loop, the never-list | executing the rewrite |
| [rewrite/LEDGER.md](rewrite/LEDGER.md) | every task with its status | picking the next task |
| [rewrite/plan.md](rewrite/plan.md) | goal, definition of done, phases, risks, cutover | planning or reviewing |
| [rewrite/playbooks/](rewrite/playbooks/port-a-module.md) | step-by-step recipes (port a module, goldens, UI, kernel, app, sync, stuck) | the ledger row links one |
| [rewrite/modules/](rewrite/modules/kernel.md) | one port sheet per module: legacy files, contracts, tickets, census | porting that module |
| [rewrite/carryover.md](rewrite/carryover.md) | open tickets the rewrite must honour, by module | S1 of a module port |
| [rewrite/questions.md](rewrite/questions.md) | questions waiting for the owner | blocked |

## API contract and operations

| doc | what | read when |
|---|---|---|
| [guides/task-api-spec.md](guides/task-api-spec.md) | the `/api` contract the Android app and TaskFocus rely on | touching any `/api` route |
| [guides/test-site.md](guides/test-site.md) | test.familyplanz.com deploys + Vercel MCP checks | verifying a push |
| [guides/svelte-mcp.md](guides/svelte-mcp.md) | Svelte MCP docs + autofixer workflow | writing Svelte |
| [guides/e2e-test-instructions.md](guides/e2e-test-instructions.md) | running Playwright locally | e2e work |
| [guides/page-perf-playbook.md](guides/page-perf-playbook.md) | page performance checks | a slow page |
| [guides/observability.md](guides/observability.md) | logs, Sentry plan | debugging production |
| [guides/backup-restore.md](guides/backup-restore.md) | Neon backup and restore runbook | data recovery |
| [guides/data-retention.md](guides/data-retention.md) | what is kept, for how long, and what deletes it | retention or privacy work |
| [guides/access-review.md](guides/access-review.md) | quarterly access review template | security review |
| [guides/ownership.md](guides/ownership.md) | who owns what | escalation |

## Android

| doc | what |
|---|---|
| [guides/android-design-tokens.md](guides/android-design-tokens.md) | Android theme tokens mapped from the web |
| [guides/android-release.md](guides/android-release.md) | release process |
| [guides/android-push.md](guides/android-push.md) | FCM push setup |
| [guides/fdroid-repo.md](guides/fdroid-repo.md) | the self-hosted F-Droid repo |
| [specs/android-mobile-clone.md](specs/android-mobile-clone.md) | the Android clone spec |
| [play-store-listing.md](play-store-listing.md) | store listing copy |
| [issues/](issues/README.md) | active tickets (currently Android only) |

## Tracking and history

| doc | what |
|---|---|
| [issues/README.md](issues/README.md) | ticket conventions + active tickets |
| [STATUS.md](STATUS.md) | short rollup of active work |
| [archive/README.md](archive/README.md) | old tickets, the old STATUS rollup, old plans and specs. Read only when researching history |
