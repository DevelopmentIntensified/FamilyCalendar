# 0009. Docs are code: module READMEs, a hub AGENTS.md, archived tickets

Status: accepted (2026-11-11)

Every module folder has a `README.md` covering purpose, files, public interface, how to test, invariants and dependencies. Its Files table links every file in the folder with what the file does, why it exists and which test pins it. `npm run docs:check` fails when a file is missing from the table, a linked file is gone, or any relative link in the docs is broken.

`AGENTS.md` is a short hub (at most 120 lines). It routes an agent to the one document its task needs: [docs/README.md](../README.md) maps every live doc. The 300+ historical tickets and the old STATUS rollup moved to `docs/archive/`. Open items the rewrite must honour were carried into [docs/rewrite/carryover.md](../rewrite/carryover.md).

## Why

Agents spend most of their context finding things. A module README of about 100 lines replaces grepping a 2,500-line file and reading tickets of mixed freshness. A machine-checked README can't silently rot, and a hub AGENTS.md keeps per-turn context small.
