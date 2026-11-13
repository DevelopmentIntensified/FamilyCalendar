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

/**
 * `NO_PROXY` with loopback added. Playwright probes the preview server through
 * the host's proxy settings; an `HTTP(S)_PROXY` without `NO_PROXY` answers that
 * probe with a 502 and Playwright reports the port as already used. This
 * mirrors `withLoopbackNoProxy` in e2e/pages/env.ts (a plain .mjs runner cannot
 * import the TS module), and the config repeats it for its own process.
 */
function withLoopbackNoProxy(value) {
	const entries = (value ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
	if (entries.includes('*')) return entries.join(',');
	for (const host of ['localhost', '127.0.0.1', '::1']) {
		if (!entries.includes(host)) entries.push(host);
	}
	return entries.join(',');
}

// One command string + `shell: true`, the form the other repo scripts use:
// `npx` is a .cmd shim on Windows, and a bare `spawnSync('npx', args)` fails
// there with ENOENT.
const command = `npx ${playwrightArgs.join(' ')}`;
const result = spawnSync(command, {
	stdio: 'inherit',
	// The config, the spec and the snapshots are all resolved from here.
	cwd: REPO_ROOT,
	shell: true,
	env: {
		...process.env,
		PAGES_MODULE: moduleName,
		NO_PROXY: withLoopbackNoProxy(process.env.NO_PROXY),
		no_proxy: withLoopbackNoProxy(process.env.no_proxy)
	}
});

if (result.error) {
	console.error('pages-run: could not start Playwright:', result.error);
	process.exit(1);
}

process.exit(result.status ?? 1);
