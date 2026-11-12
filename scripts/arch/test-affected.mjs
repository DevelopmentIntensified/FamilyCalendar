#!/usr/bin/env node
// `npm run test:affected [-- <base-ref>]`: run only the tests whose import
// graph reaches a changed file, which means the changed module's own tests and
// every dependent downstream of it. Never the whole suite (owner directive
// 2026-11-11; docs/architecture/testing.md#gates).
//
//   no argument   uncommitted changes (staged, unstaged, untracked)
//   <base-ref>    everything changed since that commit, plus uncommitted
//
// Not import-reachable: sql/migrations and the db test infrastructure. After
// changing those, also run `npx vitest run --project db`.
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib.mjs';

const base = process.argv[2];
const changed = base ? `--changed=${base}` : '--changed';
const result = spawnSync(`npx vitest run ${changed} --passWithNoTests`, {
	cwd: ROOT,
	stdio: 'inherit',
	shell: true
});
process.exit(result.status ?? 1);
