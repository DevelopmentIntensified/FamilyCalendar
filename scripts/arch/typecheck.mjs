#!/usr/bin/env node
// `npm run typecheck` — svelte-check against a list baseline.
//   v2 code (src/lib/{kernel,domains,screens,app})  must have ZERO errors.
//   everything else                                 every error must be covered by scripts/arch/typecheck-baseline.json:
//                                                   a list of { file, message } entries, matched by file and
//                                                   canonical message; line numbers are ignored and duplicates are
//                                                   kept as a multiset.
// The canonical message (both sides, baseline entries and current errors): whitespace collapsed, and every
// object-type literal `{ ... }` rewritten with its top-level members sorted, because TypeScript prints expanded
// object types with properties in a run-dependent order (`{ id; createdAt; userId }` vs `{ id; userId; createdAt }`)
// and would otherwise report the same legacy errors as `new N, fixed N`. The file name stays part of the key;
// the baseline file keeps the message text it was seeded with (nothing is rewritten to match).
// `npm run typecheck -- --init`    writes that list from the current run, only when the legacy error count still
//                                  equals the old count baseline in the same file; otherwise it refuses.
// `npm run typecheck -- --ratchet` drops baseline entries that no longer occur (never adds) after a green run.
// `npm run typecheck -- --list`    prints every legacy error grouped by file.
// Doc: docs/architecture/testing.md#gates
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, V2_ROOTS } from './lib.mjs';

const BASELINE = path.join(ROOT, 'scripts/arch/typecheck-baseline.json');
const COMMENT =
	'svelte-check ERROR list outside v2 code: { file, message } per error, line numbers ignored, message canonicalized (whitespace collapsed, object-type members sorted), duplicates counted. `npm run typecheck -- --init` seeds it; `--ratchet` only drops entries.';
const init = process.argv.includes('--init');
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

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Splits an object-type body at its top-level `;`/`,` separators, keeping nested brackets and quoted text whole.
// svelte-check's machine output escapes inner quotes as \" — a backslash is display escaping, not a quote escape,
// so every `"` (or backtick) toggles the quote state.
const splitMembers = (body) => {
	const members = [];
	let member = '';
	let depth = 0;
	let quote = '';
	for (let index = 0; index < body.length; index += 1) {
		const char = body[index];
		if (quote !== '') {
			member += char;
			if (char === quote) quote = '';
			continue;
		}
		if (char === '"' || char === '`') {
			quote = char;
			member += char;
			continue;
		}
		if (char === '{' || char === '(' || char === '[') depth += 1;
		else if (char === '}' || char === ')' || char === ']') depth -= 1;
		if ((char === ';' || char === ',') && depth === 0) {
			members.push(member);
			member = '';
			continue;
		}
		member += char;
	}
	members.push(member);
	return members.map((text) => text.trim()).filter(Boolean);
};

// Rewrites every balanced `{ ... }` region with its members sorted (and the members' own braces rewritten too).
// Sorting keeps the key independent of the property order TypeScript prints in a given run; unbalanced braces and
// quoted text are passed through untouched.
const canonicalBraceOrder = (text) => {
	let result = '';
	let index = 0;
	while (index < text.length) {
		if (text[index] !== '{') {
			result += text[index];
			index += 1;
			continue;
		}
		let depth = 0;
		let quote = '';
		let end = -1;
		for (let cursor = index; cursor < text.length; cursor += 1) {
			const char = text[cursor];
			if (quote !== '') {
				if (char === quote) quote = '';
				continue;
			}
			if (char === '"' || char === '`') {
				quote = char;
				continue;
			}
			if (char === '{') depth += 1;
			else if (char === '}') {
				depth -= 1;
				if (depth === 0) {
					end = cursor;
					break;
				}
			}
		}
		if (end === -1) {
			result += text[index];
			index += 1;
			continue;
		}
		const body = text.slice(index + 1, end);
		const members = splitMembers(canonicalBraceOrder(body)).sort(compareText);
		result += members.length > 0 ? `{ ${members.join('; ')} }` : '{}';
		index = end + 1;
	}
	return result;
};

const normalize = (message) =>
	canonicalBraceOrder(String(message ?? '').replace(/\s+/g, ' ').trim());
const keyOf = (entry) => `${entry.file}\u0000${normalize(entry.message)}`;

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

const existing = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
const baseline = Array.isArray(existing?.errors) ? existing.errors : [];
const oldCount = typeof existing?.legacyErrors === 'number' ? existing.legacyErrors : null;

// Multiset match: a legacy error is covered only when the baseline still has an unused copy of it.
const remaining = new Map();
for (const entry of baseline) remaining.set(keyOf(entry), (remaining.get(keyOf(entry)) ?? 0) + 1);
const newErrors = [];
for (const error of legacyErrors) {
	const key = keyOf(error);
	const left = remaining.get(key) ?? 0;
	if (left > 0) remaining.set(key, left - 1);
	else newErrors.push(error);
}
const fixed = [...remaining.values()].reduce((total, count) => total + count, 0);

const formatBaseline = (entries) => {
	const sorted = [...entries].sort(
		(a, b) => a.file.localeCompare(b.file) || normalize(a.message).localeCompare(normalize(b.message))
	);
	const rows = sorted.map(
		(entry) => `\t\t{ "file": ${JSON.stringify(entry.file)}, "message": ${JSON.stringify(normalize(entry.message))} }`
	);
	return `{\n\t"_comment": ${JSON.stringify(COMMENT)},\n\t"errors": [${rows.length > 0 ? `\n${rows.join(',\n')}\n\t` : ''}]\n}\n`;
};
const writeBaseline = (entries) => writeFileSync(BASELINE, formatBaseline(entries));
const summary = (covered, fresh, dropped) =>
	`typecheck: v2 errors ${v2Errors.length}, legacy errors ${legacyErrors.length} (baseline ${covered}), new ${fresh}, fixed ${dropped}`;

for (const error of v2Errors) console.log(`TYPE  ${error.file}:${error.line}  ${error.message}`);

if (init) {
	if (oldCount === null) {
		console.log(summary(0, legacyErrors.length, 0));
		console.log(
			'typecheck: --init refused — no old count baseline (legacyErrors) in scripts/arch/typecheck-baseline.json to verify against'
		);
		process.exit(1);
	}
	if (legacyErrors.length !== oldCount) {
		console.log(summary(0, legacyErrors.length, 0));
		console.log(
			`typecheck: --init refused — legacy errors ${legacyErrors.length} != old count baseline ${oldCount}; fix the tree first`
		);
		process.exit(1);
	}
	writeBaseline(legacyErrors);
	console.log(summary(legacyErrors.length, 0, 0));
	console.log(`typecheck: baseline written with ${legacyErrors.length} legacy errors`);
	process.exit(v2Errors.length > 0 ? 1 : 0);
}

for (const error of newErrors) console.log(`NEW  ${error.file}:${error.line}  ${error.message}`);
if (list) {
	const byFile = new Map();
	for (const error of legacyErrors)
		byFile.set(error.file, [...(byFile.get(error.file) ?? []), error]);
	for (const [file, fileErrors] of [...byFile].sort()) {
		console.log(`${file} (${fileErrors.length})`);
		for (const error of fileErrors) console.log(`  ${error.line}: ${error.message.slice(0, 160)}`);
	}
}
console.log(summary(baseline.length, newErrors.length, fixed));

if (ratchet) {
	if (v2Errors.length > 0 || newErrors.length > 0) {
		console.log('typecheck: --ratchet skipped — the run must be green first (no v2 errors, no new legacy errors)');
	} else {
		const used = new Map();
		for (const error of legacyErrors) used.set(keyOf(error), (used.get(keyOf(error)) ?? 0) + 1);
		const kept = [];
		for (const entry of baseline) {
			const key = keyOf(entry);
			const left = used.get(key) ?? 0;
			if (left > 0) {
				kept.push(entry);
				used.set(key, left - 1);
			}
		}
		if (kept.length !== baseline.length) {
			writeBaseline(kept);
			console.log(
				`typecheck: baseline set to ${kept.length} entries (dropped ${baseline.length - kept.length})`
			);
		} else {
			console.log(`typecheck: baseline unchanged (${kept.length} entries)`);
		}
	}
}

if (v2Errors.length > 0 || newErrors.length > 0) {
	if (newErrors.length > 0)
		console.log(
			'typecheck: legacy errors are not covered by the baseline — the last change broke types outside v2. Fix it; the list is seeded with --init and only lowered by --ratchet.'
		);
	process.exit(1);
}
