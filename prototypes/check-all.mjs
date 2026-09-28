#!/usr/bin/env node
/**
 * One command for the whole prototype estate.
 *
 * Twelve check scripts that each prove one thing, and a collector that has to
 * be running for half of them. Twelve commands to remember is twelve commands
 * nobody runs, so this runs them in order and fails on the first red.
 *
 *   node prototypes/check-all.mjs
 *
 * Suites that need the collector are detected, not assumed: if 4180 is not
 * listening, they are reported as SKIPPED with the command to start it, and
 * the rest still run. A check that silently does nothing is worse than a
 * check that fails, so a skip is loud and never counted as a pass.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { createConnection } from 'node:net';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = 4180;

/** Ask the port, rather than assuming: a "needs the server" suite is a guess otherwise. */
function serverIsUp(port) {
	return new Promise((resolve) => {
		const sock = createConnection({ port, host: '127.0.0.1' });
		const done = (up) => {
			sock.destroy();
			resolve(up);
		};
		sock.once('connect', () => done(true));
		sock.once('error', () => done(false));
		sock.setTimeout(1000, () => done(false));
	});
}

const SUITES = [
	// ---- offline: no server needed ----
	{ name: 'review-check', path: 'review-check.mjs', needsServer: false, why: 'review state vs disk + feedback' },
	{ name: 'tree-check', path: 'tree-check.mjs', needsServer: false, why: 'does the tree match the disk' },
	{ name: 'app-check', path: 'app-ui/app-check.mjs', needsServer: false, why: 'nine sections over the app set' },
	{ name: 'calendar/lint', path: 'calendar-ui/lint.mjs', needsServer: false, why: 'prototype lint rules' },
	{ name: 'calendar/smoke', path: 'calendar-ui/smoke.mjs', needsServer: false, why: 'the calendar set renders' },
	{ name: 'calendar/nav-check', path: 'calendar-ui/nav-check.mjs', needsServer: false, why: 'nav matches navItems' },
	{ name: 'calendar/sync-baseline', path: 'calendar-ui/sync-baseline.mjs', needsServer: false, why: 'data stays in step' },
	{ name: 'calendar/dock-check', path: 'calendar-ui/dock-check.mjs', needsServer: false, why: 'one collapsed dock, not two bars' },
	{ name: 'calendar/drag-check', path: 'calendar-ui/drag-check.mjs', needsServer: false, why: 'drag seam' },
	{ name: 'calendar/feedback-check', path: 'calendar-ui/feedback-check.mjs', needsServer: false, why: 'overlay contract' },
	// ---- need the collector over HTTP ----
	{ name: 'serve-check', path: 'serve-check.mjs', needsServer: true, why: 'every page serves and runs' },
	{ name: 'calendar/feedback-e2e', path: 'calendar-ui/feedback-e2e.mjs', needsServer: true, why: 'marks round-trip' },
	{ name: 'calendar/rounds-e2e', path: 'calendar-ui/rounds-e2e.mjs', needsServer: true, why: 'rounds are never truncated' }
];

const up = await serverIsUp(PORT);
if (up) {
	console.log(`collector: up on http://127.0.0.1:${PORT}/`);
} else {
	console.log(`collector: NOT up — suites that need HTTP will be SKIPPED`);
	console.log(`  start it:  node "$env:USERPROFILE\\.agents\\skills\\prototype\\assets\\feedback\\collector.mjs" --root "$PWD\\prototypes" --port ${PORT}`);
}

let red = 0;
let green = 0;
let skipped = 0;

for (const suite of SUITES) {
	if (suite.needsServer && !up) {
		skipped++;
		console.log(`\n--- ${suite.name}: SKIPPED (needs the collector) — ${suite.why}`);
		continue;
	}
	process.stdout.write(`\n--- ${suite.name}: ${suite.why}\n`);
	const res = spawnSync(process.execPath, [join(ROOT, suite.path)], {
		cwd: ROOT,
		stdio: 'inherit'
	});
	if (res.status === 0) green++;
	else {
		red++;
		console.log(`    ^^ ${suite.name} FAILED (exit ${res.status})`);
	}
}

console.log(
	`\n${'='.repeat(60)}\n${green} green · ${red} red · ${skipped} skipped` +
		(red === 0 ? '\nprototype estate is clean' : `\n${red} suite(s) red`)
);
process.exit(red === 0 ? 0 : 1);
