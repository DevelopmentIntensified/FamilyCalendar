#!/usr/bin/env node
// `npm run visual:baseline -- <module>` / `npm run visual:check -- <module>`
//
// One module's page screenshots: sets PAGES_MODULE and runs the pages config's
// visual spec, with `--update-snapshots` for a baseline. Stdio and the exit code
// pass straight through, so the npm script fails exactly when Playwright does.
//
// Doc: e2e/pages/README.md
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [mode, moduleName] = process.argv.slice(2);

/** The repo root: this file lives in scripts/, one level down. */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

if ((mode !== 'baseline' && mode !== 'check') || !moduleName) {
	console.error('usage: node scripts/pages-run.mjs <baseline|check> <module>');
	console.error('  module  one of the catalog modules, e.g. groceries');
	console.error('  example npm run visual:check -- groceries');
	process.exit(1);
}

const playwrightArgs = [
	'playwright',
	'test',
	'-c',
	'playwright.pages.config.ts',
	'e2e/pages/visual.spec.ts'
];
if (mode === 'baseline') playwrightArgs.push('--update-snapshots');

const result = spawnSync('npx', playwrightArgs, {
	stdio: 'inherit',
	// The config, the spec and the snapshots are all resolved from here.
	cwd: REPO_ROOT,
	// npx is a .cmd shim on Windows.
	shell: true,
	env: { ...process.env, PAGES_MODULE: moduleName }
});

process.exit(result.status ?? 1);
