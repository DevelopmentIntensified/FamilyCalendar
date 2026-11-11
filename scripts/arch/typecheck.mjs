#!/usr/bin/env node
// `npm run typecheck` — svelte-check with a ratchet.
//   v2 code (src/lib/{kernel,domains,screens,app})  must have ZERO errors.
//   everything else                                 may not exceed scripts/arch/typecheck-baseline.json.
// `npm run typecheck -- --ratchet` lowers the baseline after legacy errors disappear (never raises it).
// `npm run typecheck -- --list`    prints every legacy error grouped by file.
// Doc: docs/architecture/testing.md#gates
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, V2_ROOTS } from './lib.mjs';

const BASELINE = path.join(ROOT, 'scripts/arch/typecheck-baseline.json');
const ratchet = process.argv.includes('--ratchet');
const list = process.argv.includes('--list');

const run = (command) => {
	try {
		return execSync(command, {
			cwd: ROOT,
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
			stdio: ['ignore', 'pipe', 'pipe']
		});
	} catch (failure) {
		return `${failure.stdout ?? ''}\n${failure.stderr ?? ''}`;
	}
};

run('npx svelte-kit sync');
const output = run('npx svelte-check --tsconfig ./tsconfig.json --output machine');
const errors = output
	.split('\n')
	.map((line) => line.match(/^\d+\s+ERROR\s+"([^"]+)"\s+(\d+):(\d+)\s+"(.*)"\s*$/))
	.filter(Boolean)
	.map((match) => ({
		file: match[1].replace(/\\+/g, '/').replace(/\/+/g, '/'),
		line: Number(match[2]),
		message: match[4]
	}));

const inV2 = (file) => V2_ROOTS.some((root) => file.startsWith(root) || file.includes(`/${root}`));
const v2Errors = errors.filter((error) => inV2(error.file));
const legacyErrors = errors.filter((error) => !inV2(error.file));
const baseline = existsSync(BASELINE)
	? JSON.parse(readFileSync(BASELINE, 'utf8')).legacyErrors
	: Infinity;

for (const error of v2Errors) console.log(`TYPE  ${error.file}:${error.line}  ${error.message}`);
if (list) {
	const byFile = new Map();
	for (const error of legacyErrors)
		byFile.set(error.file, [...(byFile.get(error.file) ?? []), error]);
	for (const [file, fileErrors] of [...byFile].sort()) {
		console.log(`${file} (${fileErrors.length})`);
		for (const error of fileErrors) console.log(`  ${error.line}: ${error.message.slice(0, 160)}`);
	}
}
console.log(
	`typecheck: v2 errors ${v2Errors.length} (must be 0), legacy errors ${legacyErrors.length} (baseline ${baseline})`
);

if (ratchet && legacyErrors.length <= baseline && v2Errors.length === 0) {
	writeFileSync(
		BASELINE,
		`${JSON.stringify({ _comment: 'svelte-check ERROR count outside v2 code. Only ever lowered by npm run typecheck -- --ratchet.', legacyErrors: legacyErrors.length }, null, '\t')}\n`
	);
	console.log(`typecheck: baseline set to ${legacyErrors.length}`);
}
if (v2Errors.length > 0 || legacyErrors.length > baseline) {
	if (legacyErrors.length > baseline)
		console.log(
			'typecheck: legacy error count went UP — the last change broke types outside v2. Fix it; never raise the baseline.'
		);
	process.exit(1);
}
