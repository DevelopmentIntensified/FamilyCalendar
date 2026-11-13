#!/usr/bin/env node
// `npm run visual:baseline|visual:check -- <module>` and
// `npm run perf:check -- <module>` / `npm run perf:baseline`
//
// One runner for the page harness. Visual modes set PAGES_MODULE and run the
// visual spec, with `--update-snapshots=all` for a baseline (the bare flag only
// rewrites snapshots that fail the comparison, so a wrong baseline inside the
// diff tolerance would survive a re-baseline). Perf modes set PAGES_MODULE and
// PERF_MODE and run the perf spec under its own project.
//
// Stdio and the exit code pass straight through, so the npm script fails
// exactly when Playwright does.
//
// Doc: e2e/pages/README.md
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [mode, moduleName] = process.argv.slice(2);

/** The repo root: this file lives in scripts/, one level down. */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const USAGE = [
	'usage: node scripts/pages-run.mjs <mode> [module]',
	'  baseline       write the visual snapshots of one module',
	'  check          compare one module against its snapshots',
	'  perf           measure one module against its budgets',
	'  perf-baseline  measure every page and write the perf baseline',
	'  module         one of the catalog modules, e.g. groceries (not perf-baseline)',
	'  example: npm run perf:check -- groceries'
].join('\n');

const MODES = new Set(['baseline', 'check', 'perf', 'perf-baseline']);
if (!MODES.has(mode)) {
	console.error(USAGE);
	process.exit(1);
}

// `perf:baseline` is the whole catalog: a per-module baseline would overwrite
// the committed one with a single module's pages.
const needsModule = mode !== 'perf-baseline';
if (needsModule && !moduleName) {
	console.error(USAGE);
	process.exit(1);
}
if (!needsModule && moduleName) {
	console.error('pages-run: perf-baseline measures every page; drop the module argument.');
	process.exit(1);
}

const playwrightArgs = ['playwright', 'test', '-c', 'playwright.pages.config.ts'];
if (mode === 'baseline') playwrightArgs.push('e2e/pages/visual.spec.ts', '--update-snapshots=all');
else if (mode === 'check') playwrightArgs.push('e2e/pages/visual.spec.ts');
// The perf spec makes its own contexts; the project only selects it once.
else playwrightArgs.push('--project=perf', 'e2e/pages/perf.spec.ts');

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

const env = {
	...process.env,
	NO_PROXY: withLoopbackNoProxy(process.env.NO_PROXY),
	no_proxy: withLoopbackNoProxy(process.env.no_proxy)
};
// Set exactly what this mode means: a leftover PAGES_MODULE/PERF_MODE in the
// shell must not turn a visual run into a perf run (or the reverse).
if (moduleName) env.PAGES_MODULE = moduleName;
else delete env.PAGES_MODULE;
if (mode === 'perf') env.PERF_MODE = 'check';
else if (mode === 'perf-baseline') env.PERF_MODE = 'baseline';
else delete env.PERF_MODE;

// One command string + `shell: true`, the form the other repo scripts use:
// `npx` is a .cmd shim on Windows, and a bare `spawnSync('npx', args)` fails
// there with ENOENT.
const command = `npx ${playwrightArgs.join(' ')}`;
const result = spawnSync(command, {
	stdio: 'inherit',
	// The config, the spec and the snapshots are all resolved from here.
	cwd: REPO_ROOT,
	shell: true,
	env
});

if (result.error) {
	console.error('pages-run: could not start Playwright:', result.error);
	process.exit(1);
}

process.exit(result.status ?? 1);
