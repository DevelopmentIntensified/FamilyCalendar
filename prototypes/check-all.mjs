#!/usr/bin/env node
/**
 * One command for a project's whole prototype estate.
 *
 * N check scripts that each prove one thing, and a collector that has to be
 * running for some of them. N commands to remember is N commands nobody runs,
 * so this runs them in order and fails on the first red.
 *
 *   node check-all.mjs [--root <prototype dir>] [--port 4180] [--no-serve]
 *
 * SUITES ARE DISCOVERED, not listed: every *.mjs in the prototype root and in
 * each set directory, minus this file. A project that drops in its own check
 * gets it run without editing anything here — which is the only way this stays
 * true in a project that is not the one it was written in.
 *
 * A suite that needs the collector is DETECTED, not assumed: if the port is
 * not listening it is reported SKIPPED with the command that starts it, and
 * the rest still run. A check that silently does nothing is worse than a check
 * that fails, so a skip is loud and never counted as a pass.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';

const argv = process.argv.slice(2);
const argOf = (f) => {
	const i = argv.indexOf(f);
	return i !== -1 ? argv[i + 1] : null;
};
// resolve(), not join(cwd, …): an absolute --root must not be glued onto cwd.
const ROOT = resolve(argOf('--root') ?? fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(argOf('--port') ?? 4180);
const SELF = basename(fileURLToPath(import.meta.url));

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

/** Suites named here are skipped without the collector; the rest need it.
 *  spacing-check hosts its own static server, so it must be in this list —
 *  a guard that skips when you forget a server is not a guard. */
const OFFLINE_HINTS = ['review-check', 'tree-check', 'lint', 'smoke', 'nav-check', 'app-check', 'spacing-check'];

/** Every *.mjs in the root and each set, minus this runner. */
function discover() {
	const found = [];
	const add = (dir, prefix = '') => {
		for (const f of readdirSync(dir)) {
			const full = join(dir, f);
			if (statSync(full).isDirectory()) {
				if (f !== 'assets' && f !== 'node_modules' && f !== 'feedback') {
					// a set is a directory holding pages; only descend into those
					if (readdirSync(full).some((x) => x.endsWith('.html'))) add(full, `${prefix}${f}/`);
				}
				continue;
			}
			if (!f.endsWith('.mjs') || f === SELF) continue;
			found.push({ name: f.replace(/\.mjs$/, ''), file: full, where: `${prefix}${f}` });
		}
	};
	add(ROOT);
	return found.sort((a, b) => a.where.localeCompare(b.where));
}

const up = await serverIsUp(PORT);
if (up) console.log(`collector: up on http://127.0.0.1:${PORT}/`);
else {
	console.log(`collector: NOT up — suites that need HTTP will be SKIPPED`);
	console.log(`  start it:  npm run proto:serve   (or: node <collector> --root . --port ${PORT})`);
}

const suites = discover();
if (suites.length === 0) {
	console.log('\nno check scripts found — nothing to run\n');
	process.exit(0);
}

let red = 0;
let green = 0;
let skipped = 0;

for (const s of suites) {
	const needsServer = !OFFLINE_HINTS.some((h) => s.name.includes(h));
	if (needsServer && !up) {
		skipped++;
		console.log(`\n--- ${s.where}: SKIPPED (needs the collector)`);
		continue;
	}
	process.stdout.write(`\n--- ${s.where}\n`);
	// cwd, not --root: the suites live in the root and take their own location
	// as the default. Passing --root broke serve-check, which reads argv[2]
	// positionally as its PORT and built "http://127.0.0.1:--root/".
	const res = spawnSync(process.execPath, [s.file], { cwd: ROOT, stdio: 'inherit' });
	if (res.status === 0) green++;
	else {
		red++;
		console.log(`    ^^ ${s.where} FAILED (exit ${res.status})`);
	}
}

console.log(
	`\n${'='.repeat(60)}\n${green} green · ${red} red · ${skipped} skipped` +
		(red === 0 ? '\nprototype estate is clean' : `\n${red} suite(s) red`)
);
process.exit(red === 0 ? 0 : 1);
