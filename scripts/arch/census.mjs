#!/usr/bin/env node
// `npm run census` — how much legacy code is left, per module.
//
//   npm run census                  table of every module (progress = legacy files gone)
//   npm run census -- tasks         one module: remaining legacy files, routes, tests, importers
//   npm run census -- tasks --titles  legacy test titles not yet re-homed (behaviour accounting)
//   npm run census -- --write       refresh the CENSUS block in docs/rewrite/modules/<module>.md
//
// Data: scripts/arch/legacy-map.json (legacy file -> owning module).
// Doc: docs/rewrite/README.md#census
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PORT_ORDER, moduleByName } from './registry.mjs';
import {
	ROOT,
	isCode,
	isTest,
	importsPortedCode,
	listFiles,
	parseImports,
	readJson,
	readText as readTextUncached,
	resolveSpec
} from './lib.mjs';

const textCache = new Map();
const readText = (file) => {
	if (!textCache.has(file)) textCache.set(file, readTextUncached(file));
	return textCache.get(file);
};

const args = process.argv.slice(2);
const write = args.includes('--write');
const titles = args.includes('--titles');
const only = args.find((arg) => !arg.startsWith('--'));

const map = readJson('scripts/arch/legacy-map.json').files;
const files = listFiles();
const fileSet = new Set(files);
const bridges = readJson('scripts/arch/legacy-bridges.json').bridges;

const entries = Object.entries(map).map(([file, info]) => ({
	file,
	...info,
	exists: fileSet.has(file)
}));
const isRouteWiring = (file) =>
	fileSet.has(file) && isCode(file) && importsPortedCode(file, readText(file), fileSet);

function summary(module) {
	const own = entries.filter((entry) => entry.module === module);
	const sources = own.filter((entry) => entry.kind === 'source');
	const tests = own.filter((entry) => entry.kind === 'test' || entry.kind === 'route-test');
	const routes = own.filter((entry) => entry.kind === 'route');
	const left = (list) => list.filter((entry) => entry.exists);
	const routesLeft = routes.filter((entry) => entry.exists && !isRouteWiring(entry.file));
	const total = sources.length + tests.length + routes.length;
	const remaining = left(sources).length + left(tests).length + routesLeft.length;
	return {
		module,
		sources: { total: sources.length, left: left(sources) },
		tests: { total: tests.length, left: left(tests) },
		routes: { total: routes.length, left: routesLeft },
		loc: left(sources).reduce((sum, entry) => sum + entry.loc, 0),
		done: total === 0 ? 100 : Math.round(((total - remaining) / total) * 100),
		bridges: bridges.filter((bridge) => bridge.from.includes(`/${module}/`))
	};
}

const modules = [...PORT_ORDER, 'kernel'].filter((name, index, all) => all.indexOf(name) === index);

function table() {
	const rows = modules.map(summary);
	const lines = [
		'module            done  legacy-src  legacy-LOC  legacy-tests  unported-routes  bridges'
	];
	for (const row of rows) {
		lines.push(
			`${row.module.padEnd(17)} ${String(row.done).padStart(3)}%  ${String(`${row.sources.left.length}/${row.sources.total}`).padStart(10)}  ${String(row.loc).padStart(10)}  ${String(`${row.tests.left.length}/${row.tests.total}`).padStart(12)}  ${String(`${row.routes.left.length}/${row.routes.total}`).padStart(15)}  ${String(row.bridges.length).padStart(7)}`
		);
	}
	const e2e = entries.filter(
		(entry) => entry.kind === 'e2e' && entry.exists && importsLegacyServer(entry.file)
	).length;
	lines.push('', `e2e files still importing legacy server code: ${e2e}`);
	const all = rows.reduce((sum, row) => sum + row.sources.left.length, 0);
	lines.push(`legacy source files left: ${all}`);
	return lines.join('\n');
}

function importsLegacyServer(file) {
	return /src\/lib\/server\//.test(readText(file));
}

function importersOf(file) {
	const result = [];
	for (const other of files) {
		if (other === file || !isCode(other)) continue;
		const text = readText(other);
		if (!text.includes(path.posix.basename(file).replace(/\.(ts|svelte)$/, ''))) continue;
		if (parseImports(text).some((imp) => resolveSpec(other, imp.spec, fileSet) === file))
			result.push(other);
	}
	return result;
}

function detail(module) {
	const row = summary(module);
	const out = [`# ${module}: ${row.done}% ported`, ''];
	out.push(
		`legacy source files left (${row.sources.left.length}/${row.sources.total}, ${row.loc} LOC):`
	);
	for (const entry of row.sources.left) {
		const importers = importersOf(entry.file).filter((other) => !isTest(other));
		out.push(`  - ${entry.file} (${entry.loc} LOC, ${entry.layer}) importers: ${importers.length}`);
		if (entry.note) out.push(`      NOTE: ${entry.note}`);
	}
	out.push('', `route files not yet wiring-only (${row.routes.left.length}/${row.routes.total}):`);
	for (const entry of row.routes.left)
		out.push(`  - ${entry.file}  ${entry.url}${entry.note ? `\n      NOTE: ${entry.note}` : ''}`);
	out.push(
		'',
		`legacy test files left (${row.tests.left.length}/${row.tests.total}) — reference only, kinds explained in docs/architecture/testing.md:`
	);
	for (const entry of row.tests.left) {
		out.push(`  - ${entry.file} [${testKind(entry.file)}, ${testTitles(entry.file).length} tests]`);
	}
	if (row.bridges.length) {
		out.push('', 'open legacy bridges:');
		for (const bridge of row.bridges)
			out.push(`  - ${bridge.from} -> ${bridge.to} (remove by ${bridge.removeBy})`);
	}
	return out.join('\n');
}

const TITLE_RE = /\b(?:it|test)(?:\.each\([\s\S]*?\))?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;

function testTitles(file) {
	return [...readText(file).matchAll(TITLE_RE)]
		.map((match) => match[2])
		.filter((title) => !/[$%]/.test(title));
}

/** What a legacy test file is worth to the rebuild (docs/architecture/testing.md#legacy-tests-are-reference-not-a-gate). */
function testKind(file) {
	const text = readText(file);
	if (/\/prototype\/|__diag/.test(file)) return 'dead';
	if (file.startsWith('src/routes/') && !/\.svelte\.test\.ts$/.test(file)) return 'route';
	if (/\.svelte\.test\.ts$/.test(file) || /\brender\(/.test(text)) return 'component';
	if (/\.real\.test\.ts$/.test(file) || /testHarness/.test(text)) return 'real-db';
	if (/vi\.(mock|doMock)\(\s*['"]\$lib\/server\/db['"]/.test(text)) return 'stub-db';
	if (/vi\.(mock|doMock)\(/.test(text)) return 'mocked';
	return 'pure';
}

/** Legacy test titles of a module, as a checklist for the S1 behaviour inventory (no bookkeeping required). */
function untitled(module) {
	const out = [`# ${module}: legacy test titles (reference for the S1 behaviour inventory)`, ''];
	let count = 0;
	for (const entry of entries.filter(
		(e) => e.module === module && (e.kind === 'test' || e.kind === 'route-test') && e.exists
	)) {
		const titleList = testTitles(entry.file);
		if (!titleList.length) continue;
		out.push(`${entry.file} [${testKind(entry.file)}]`);
		for (const title of titleList) out.push(`  - ${title}`);
		count += titleList.length;
	}
	out.push('', `${count} title(s)`);
	return out.join('\n');
}

function refreshSheets() {
	let updated = 0;
	for (const module of modules) {
		const sheet = path.join(ROOT, 'docs/rewrite/modules', `${module}.md`);
		if (!existsSync(sheet)) continue;
		const text = readFileSync(sheet, 'utf8');
		const block = `<!-- census:begin (generated by npm run census -- --write) -->\n\`\`\`text\n${detail(module)}\n\`\`\`\n<!-- census:end -->`;
		const next = text.replace(/<!-- census:begin[\s\S]*?<!-- census:end -->/, block);
		if (next !== text) {
			writeFileSync(sheet, next);
			updated++;
		}
	}
	console.log(`census: refreshed ${updated} module sheet(s)`);
}

if (write) refreshSheets();
else if (only && !moduleByName(only)) {
	console.error(`unknown module '${only}'. Known: ${modules.join(', ')}`);
	process.exit(2);
} else if (only && titles) console.log(untitled(only));
else if (only) console.log(detail(only));
else console.log(table());
