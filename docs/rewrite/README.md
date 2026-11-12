# Rewrite v2: start here

You are executing the v2 rewrite of the Family Planz website and server. The Android app (`apps/android`) is out of scope: never edit it. Its HTTP contract is sacred.

The design is in [docs/architecture/README.md](../architecture/README.md). The why is in the ADRs (0003–0010) in [docs/adr/](../adr/). This folder is the plan. Execute it one task at a time. The rewrite's goals: readable code, deep modules ([conventions › Depth](../architecture/conventions.md#depth)) and fast pages ([ADR 0010](../adr/0010-performance-budget.md)).

## Setup (once per machine)

1. Work only in the worktree `C:/Users/MIRP/development/fc-v2` on branch `rewrite/v2`. The main checkout (`familyCalendar`, branch `test`) is someone else's workspace; do not edit it.
2. `npm ci`
3. Start Postgres with `docker start familycalendar-db`. That is the container the main checkout's `npm run db:up` created, on 127.0.0.1:5433. Running `npm run db:up` inside this worktree would try to create a second container with the same name. Only if the container doesn't exist, run `npm run db:up` once from the main checkout.
4. `npm run gate` must pass before you change anything. If it does not, stop and report (see [when-stuck.md](playbooks/when-stuck.md)).

## The loop (every task)

1. **Sync.** If `git log ..origin/test --oneline` shows new commits, follow [sync-with-test.md](playbooks/sync-with-test.md) first.
2. **Pick.** Open [LEDGER.md](LEDGER.md). Your task is the first row whose status is `doing`, else the first `todo`. Set it to `doing` and commit that one-line change. Do one task per session.
3. **Read.**
   - the playbook the row links to;
   - for module tasks, the module's port sheet in [modules/](modules/);
   - its rows in [carryover.md](carryover.md);
   - [CONTEXT.md](../../CONTEXT.md) for any domain word you are unsure of.

   Read nothing else unless the playbook points to it.
4. **Do.** Follow the playbook steps in order. Each step ends with a check command; do not start the next step until it is green.
5. **Verify.** Run `npm run gate`: arch, docs, types, and only the tests affected by your change, meaning the changed module's tests and everything downstream of it. Never run the whole suite, legacy or v2 (see [testing.md](../architecture/testing.md#gates)). Before pushing, run `npm run gate:push`, which adds `npm run build:safe`: a build with placeholder secrets and the local DB. Never build this worktree with a copied `.env`, because the main checkout's `.env` points at production.
6. **Record.**
   - Tick the step in the module sheet.
   - Set the ledger row to `done` and fill in the commit sha and a short note.
   - Update the module README in the same commit as the code.
   - Run `npm run census -- --write` to refresh the sheet's census block.
7. **Commit and push.** Commit after every step, with the message `rewrite(<module or task id>): <step> <what>`, for example `rewrite(feedback): S6 endpoints on kernel builders, routes wired`. Push (`git push origin rewrite/v2`) when the task is done and at the end of every session.

## Never

- Push to `test` or `main`, or merge into them. Cutover is an owner decision ([plan.md](plan.md#cutover)).
- Edit `scripts/arch/*`, `vite.config.ts` or `docs/architecture/rules.md` to make a check pass. Fix the code. If a rule is truly wrong, write it up in [questions.md](questions.md) and stop.
- Change an external contract: an `/api/**` path, status, body or error message (the golden tests), the schema, or a rule in [CONTEXT.md](../../CONTEXT.md). Those are owner tickets. Everything else (internals, page data, components, legacy code and legacy tests) is yours to throw out and redo.
- Run SQL against Neon, add a migration, or touch `.env*` files. Schema changes are owner tasks.
- Use `vi.mock` or skip a failing test.
- Fix a bug without a failing test first, or without naming its ticket in the commit.

## Where things are

| need | file |
|---|---|
| the task list and progress | [LEDGER.md](LEDGER.md), `npm run census` |
| phases, order, risks, cutover | [plan.md](plan.md) |
| running the ledger with subagents (orchestrator) | [playbooks/orchestrate.md](playbooks/orchestrate.md) |
| how to port one module | [playbooks/port-a-module.md](playbooks/port-a-module.md) |
| golden contract tests | [playbooks/characterize-endpoints.md](playbooks/characterize-endpoints.md) |
| pages, components, client state | [playbooks/port-ui.md](playbooks/port-ui.md) |
| kernel tasks (K-04 …) | [playbooks/kernel-tasks.md](playbooks/kernel-tasks.md) |
| app and cutover tasks (APP-01 …) | [playbooks/app-tasks.md](playbooks/app-tasks.md) |
| adding mail/push/AI/http to ctx | [playbooks/add-a-port.md](playbooks/add-a-port.md) |
| merging `test` into the branch | [playbooks/sync-with-test.md](playbooks/sync-with-test.md) |
| blocked, unsure, or a check seems wrong | [playbooks/when-stuck.md](playbooks/when-stuck.md) |
| per-module facts: legacy files, routes, contracts, tickets | [modules/](modules/) |
| open tickets the rewrite must honour | [carryover.md](carryover.md) |
| tests and speed rules | [docs/architecture/testing.md](../architecture/testing.md) |
| questions waiting for the owner | [questions.md](questions.md) |

## Census

`npm run census` shows, per module, how much legacy code is left. `npm run census -- <module>` lists the exact legacy files (with their kind), the routes not yet wired, the legacy tests left and the split notes. A module is done when its row is at 100%.
