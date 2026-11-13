#!/usr/bin/env node
// `npm run arch` — enforces docs/architecture/rules.md on v2 code
// (src/lib/{kernel,domains,screens,app}) and on route files that use it.
// Legacy code is not checked; it is deleted module by module instead.
// Exit 0 = clean. Every message names its rule; read the rule before fixing.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { FOREIGN_READS, MODULES, TABLE_OWNERS, moduleByName, moduleDir } from './registry.mjs';
import {
	ROOT,
	isCode,
	isLegacy,
	importsPortedCode,
	isTest,
	isV2,
	listFiles,
	locate,
	parseImports,
	readJson,
	readText,
	resolveSpec,
	stripComments
} from './lib.mjs';

const files = listFiles();
const fileSet = new Set(files);
const violations = [];
const add = (rule, file, line, message) => violations.push({ rule, file, line, message });

const RANK = Object.fromEntries(
	MODULES.filter((m) => m.kind === 'domain').map((m) => [m.name, m.rank])
);
const BRIDGES_FILE = 'scripts/arch/legacy-bridges.json';
const bridges = existsSync(path.join(ROOT, BRIDGES_FILE)) ? readJson(BRIDGES_FILE).bridges : [];
const isBridged = (from, to) => bridges.some((bridge) => bridge.from === from && bridge.to === to);

const DB_SPECS = /^(drizzle-orm(\/|$)|postgres$)/;
const SERVER_ONLY_SPECS = /^(drizzle-orm(\/|$)|postgres$|node:|\$env\/|@sveltejs\/kit\/node)/;
const PURE_FORBIDDEN_SPECS = /^(\$app\/|\$env\/|@sveltejs\/kit|drizzle-orm|postgres$|node:)/;
const AMBIENT_TIME = [
	[/\bDate\.now\(/, 'Date.now()'],
	[/new Date\(\s*\)/, 'new Date()'],
	[/\bDateTime\.now\(/, 'DateTime.now()'],
	[/\bDateTime\.local\(\s*\)/, 'DateTime.local()'],
	[/\bMath\.random\(/, 'Math.random()']
];
const TIME_EXEMPT = [
	'src/lib/kernel/time/',
	'src/lib/kernel/ids/',
	'src/lib/kernel/testing/',
	'src/lib/app/'
];

const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const entryHint = (module) => {
	const dir = moduleDir(moduleByName(module) ?? { name: module, kind: 'domain' });
	return `${dir}/index.ts (types, contracts, rules, client api), ${dir}/index.server.ts (services, http) or ${dir}/ui/index.ts (components)`;
};

for (const file of files) {
	const inV2 = isV2(file);
	const isRoute = file.startsWith('src/routes/');
	if ((!inV2 && !isRoute) || !isCode(file)) continue;

	const raw = readText(file);
	const text = stripComments(raw);
	const here = locate(file);
	const test = isTest(file);
	const imports = parseImports(text);

	for (const imp of imports) {
		const target = resolveSpec(file, imp.spec, fileSet);
		if (!inV2) continue;

		// R9 — module mocking
		if (imp.kind === 'mock' && test) {
			add(
				'R9',
				file,
				imp.line,
				`vi.mock('${imp.spec}') — replace the dependency through ctx (testCtx) or a real seam instead`
			);
		}

		// R3 — database access only in repos (and test infrastructure)
		const isTablesBridge = target === 'src/lib/kernel/db/tables.server.ts';
		if (DB_SPECS.test(imp.spec) || isTablesBridge) {
			const allowed =
				here.role === 'repo' ||
				here.role === 'fixtures' ||
				file.startsWith('src/lib/kernel/db/') ||
				file.startsWith('src/lib/kernel/testing/') ||
				/\.db\.test\.ts$/.test(file);
			if (!allowed && !imp.typeOnly) {
				add(
					'R3',
					file,
					imp.line,
					`'${imp.spec}' imported outside a *.repo.server.ts file — move the query into the module's repo`
				);
			}
			if (isTablesBridge && here.role === 'repo') {
				for (const name of imp.names) {
					const owner = TABLE_OWNERS[name];
					if (owner && owner !== here.module && !FOREIGN_READS[here.module]?.[name]) {
						add(
							'R3',
							file,
							imp.line,
							`table '${name}' belongs to '${owner}' — call ${owner}'s service, or declare a read-only join in registry.mjs FOREIGN_READS`
						);
					}
				}
			}
		}

		// R4 — pure files
		if (here.role === 'rules' || here.role === 'contract') {
			const serverTarget = target && !target.startsWith('?') && /\.server\.(ts|js)$/.test(target);
			if (PURE_FORBIDDEN_SPECS.test(imp.spec) || serverTarget) {
				add(
					'R4',
					file,
					imp.line,
					`pure ${here.role} file imports '${imp.spec}' — rules/contracts take plain values and return plain values`
				);
			}
		}

		// R6 — environment
		if (imp.spec.startsWith('$env/') && !file.startsWith('src/lib/app/')) {
			add(
				'R6',
				file,
				imp.line,
				`'${imp.spec}' outside src/lib/app — read config once in app and pass it through ctx.config`
			);
		}

		// R7 — server-only naming (kernel/testing is test-only infrastructure, never bundled)
		const targetIsServer = target && !target.startsWith('?') && /\.server\.(ts|js)$/.test(target);
		const testInfra = file.startsWith('src/lib/kernel/testing/');
		if (
			!test &&
			!testInfra &&
			!here.isServer &&
			(SERVER_ONLY_SPECS.test(imp.spec) || targetIsServer) &&
			!imp.typeOnly
		) {
			add(
				'R7',
				file,
				imp.line,
				`imports server-only '${imp.spec}' but the file name has no .server — rename it to *.server.ts (or move the import)`
			);
		}

		if (!target || target.startsWith('?')) continue;
		const there = locate(target);

		// R14 — no legacy imports from v2
		if (
			isLegacy(target) &&
			here.area !== 'app' &&
			!isBridged(file, target)
		) {
			add(
				'R14',
				file,
				imp.line,
				`imports legacy '${target}' — port what you need into this module or kernel (or record a bridge in ${BRIDGES_FILE})`
			);
		}

		if (!isV2(target)) continue;

		// R1 — layering. A TEST file in a domain or screen may import the app
		// testing factory (goldenCtx attaches the real cross-module ports);
		// nothing else in app.
		const appTesting = test && target.startsWith('src/lib/app/testing/');
		if (here.area === 'kernel' && there.area !== 'kernel') {
			add('R1', file, imp.line, `kernel imports '${target}' — kernel may import only kernel`);
		} else if (here.area === 'domain' && there.area === 'domain' && there.module !== here.module) {
			if ((RANK[there.module] ?? 999) >= (RANK[here.module] ?? -1)) {
				add(
					'R1',
					file,
					imp.line,
					`domain '${here.module}' (rank ${RANK[here.module]}) imports '${there.module}' (rank ${RANK[there.module]}) — domains import only LOWER ranks; invert with a ctx port, a callback, or a Svelte snippet`
				);
			}
		} else if (
			here.area === 'domain' &&
			(there.area === 'screen' || there.area === 'app') &&
			!appTesting
		) {
			add(
				'R1',
				file,
				imp.line,
				`domain '${here.module}' imports ${there.area} '${there.module}' — domains never import screens or app`
			);
		} else if (
			here.area === 'screen' &&
			(there.area === 'app' || (there.area === 'screen' && there.module !== here.module)) &&
			!appTesting
		) {
			add(
				'R1',
				file,
				imp.line,
				`screen '${here.module}' imports ${there.area} '${there.module}' — screens import kernel + domains only`
			);
		}

		// R2 — public entries across modules
		if (
			(there.area === 'domain' || there.area === 'screen') &&
			there.module !== here.module &&
			!there.isEntry &&
			!test
		) {
			add(
				'R2',
				file,
				imp.line,
				`reaches into '${target}' — import '${there.module}' through ${entryHint(there.module)}`
			);
		}
	}

	if (inV2 && !test) {
		// R5 — ambient time and randomness
		if (!TIME_EXEMPT.some((prefix) => file.startsWith(prefix))) {
			for (const [pattern, label] of AMBIENT_TIME) {
				const match = text.match(pattern);
				if (match)
					add(
						'R5',
						file,
						lineOf(text, match.index),
						`${label} — use ctx.clock.now() / ctx.ids (pass "now" into rules as a parameter)`
					);
			}
		}
		// R6 — process.env
		const env = text.match(/\bprocess\.env\b/);
		if (env && !file.startsWith('src/lib/app/') && !file.startsWith('src/lib/kernel/testing/')) {
			add(
				'R6',
				file,
				lineOf(text, env.index),
				'process.env outside src/lib/app — read it in app and pass it through ctx.config'
			);
		}
		// R4 — pure files: tokens
		if (here.role === 'rules' || here.role === 'contract') {
			for (const [pattern, label] of [
				[/\bfetch\(/, 'fetch('],
				[/\b(localStorage|sessionStorage|indexedDB)\b/, 'browser storage'],
				[/\b(window|document|navigator)\./, 'DOM globals']
			]) {
				const match = text.match(pattern);
				if (match)
					add('R4', file, lineOf(text, match.index), `pure ${here.role} file uses ${label}`);
			}
		}
	}

	// R8 — ported routes are wiring only (shared kernel browser helpers alone don't count)
	if (isRoute && !test && importsPortedCode(file, raw, fileSet)) {
		const problem = file.endsWith('.svelte') ? svelteRouteProblem(raw) : tsRouteProblem(text);
		if (problem)
			add(
				'R8',
				file,
				1,
				`route file uses module code but is not wiring-only (${problem}) — move logic into the module, keep only imports/exports here`
			);
	}
}

function tsRouteProblem(text) {
	const withoutImports = text
		.replace(/(^|\n)\s*import[\s\S]*?from\s*['"][^'"]+['"];?/g, '\n')
		.replace(/(^|\n)\s*import\s*['"][^'"]+['"];?/g, '\n');
	for (const [pattern, label] of [
		[/=>/, 'arrow function'],
		[/\bfunction\b/, 'function'],
		[/\bawait\b/, 'await'],
		[/\breturn\b/, 'return'],
		[/\bif\s*\(/, 'if'],
		[/\bnew\s+[A-Z]/, 'new'],
		[/`/, 'template string']
	]) {
		if (pattern.test(withoutImports)) return label;
	}
	const lines = withoutImports.split('\n').filter((line) => line.trim());
	if (lines.length > 20) return `${lines.length} non-import lines`;
	return null;
}

function svelteRouteProblem(raw) {
	const lines = raw.split('\n').filter((line) => line.trim());
	if (lines.length > 25) return `${lines.length} lines`;
	for (const [pattern, label] of [
		[/\bfetch\(/, 'fetch('],
		[/<style/, '<style>'],
		[/\$(state|derived|effect)\(/, 'runes state']
	]) {
		if (pattern.test(raw)) return label;
	}
	return null;
}

// Whole-tree rules over v2 files
const v2Files = files.filter(isV2);

// R10 — unique basenames
const ENTRY_NAMES = new Set(['index.ts', 'index.server.ts', 'README.md']);
const byBase = new Map();
for (const file of v2Files) {
	const base = path.posix.basename(file);
	if (ENTRY_NAMES.has(base)) continue;
	byBase.set(base, [...(byBase.get(base) ?? []), file]);
}
for (const [base, list] of byBase) {
	if (list.length > 1)
		add(
			'R10',
			list[1],
			1,
			`basename '${base}' also used by ${list[0]} — file names must be unique so grep finds one file`
		);
}

// R11 — unique exported definitions (a zod schema and its inferred type may share a name in ONE file)
const SKIP_EXPORTS = new Set([
	'GET',
	'POST',
	'PUT',
	'PATCH',
	'DELETE',
	'load',
	'actions',
	'prerender',
	'ssr',
	'csr',
	'trailingSlash',
	'default',
	'setup'
]);
const exportsByName = new Map();
for (const file of v2Files) {
	if (!/\.ts$/.test(file) || isTest(file) || locate(file).isEntry) continue;
	const text = stripComments(readText(file));
	for (const match of text.matchAll(
		/^export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm
	)) {
		const name = match[1];
		if (SKIP_EXPORTS.has(name)) continue;
		const places = exportsByName.get(name) ?? [];
		if (!places.some((place) => place.file === file))
			places.push({ file, line: lineOf(text, match.index) });
		exportsByName.set(name, places);
	}
}
for (const [name, places] of exportsByName) {
	if (places.length > 1) {
		add(
			'R11',
			places[1].file,
			places[1].line,
			`export '${name}' is also defined at ${places[0].file}:${places[0].line} — exported names must be unique (prefix with the module noun)`
		);
	}
}

// R12 / R15 / R13 — module folders, naming, tests
const moduleDirs = new Set();
for (const file of v2Files) {
	const here = locate(file);
	if (here.area === 'domain' || here.area === 'screen') {
		moduleDirs.add(`${here.area}:${here.module}`);
		const registered = moduleByName(here.module);
		if (!registered || registered.kind !== here.area) {
			add(
				'R12',
				file,
				1,
				`'${here.module}' is not a registered ${here.area} — add it to scripts/arch/registry.mjs first (ledger task)`
			);
		}
		const base = path.posix.basename(file);
		if (here.role === null) {
			add(
				'R15',
				file,
				1,
				`name '${base}' has no role — use ${here.module}.<topic>.<role>[.server].ts with role one of rules|contract|repo|service|http|api|state|fixtures`
			);
		}
		if (
			here.role === 'ui' &&
			!/^(index\.ts|[A-Z][A-Za-z0-9]*\.svelte|[A-Z][A-Za-z0-9]*\.svelte\.test\.ts)$/.test(base)
		) {
			add(
				'R15',
				file,
				1,
				`ui/ holds PascalCase .svelte components, their *.svelte.test.ts files and index.ts only (got '${base}')`
			);
		}
		if (['rules', 'repo', 'service', 'http'].includes(here.role) && !isTest(file)) {
			const stem = base.replace(/\.server\.ts$/, '').replace(/\.ts$/, '');
			const dir = path.posix.dirname(file);
			const hasTest = v2Files.some(
				(other) =>
					path.posix.dirname(other) === dir &&
					path.posix.basename(other).startsWith(`${stem}.`) &&
					isTest(other)
			);
			if (!hasTest)
				add(
					'R13',
					file,
					1,
					`no test next to it — add ${stem}${here.role === 'rules' ? '' : '.db'}.test.ts in the same folder`
				);
		}
	}
}
for (const module of MODULES) {
	const dir = moduleDir(module);
	const hasFiles = v2Files.some((file) => file.startsWith(`${dir}/`));
	if (hasFiles && !fileSet.has(`${dir}/README.md`))
		add(
			'R12',
			`${dir}/README.md`,
			1,
			`module '${module.name}' has code but no README.md — start from docs/architecture/module-readme-template.md`
		);
}

// Report
if (violations.length === 0) {
	const modules = [...moduleDirs].length;
	console.log(
		`arch: OK — ${v2Files.length} v2 files in ${modules} module folder(s), ${bridges.length} legacy bridge(s)`
	);
	process.exit(0);
}
violations.sort(
	(a, b) =>
		a.rule.localeCompare(b.rule, undefined, { numeric: true }) ||
		a.file.localeCompare(b.file) ||
		a.line - b.line
);
for (const v of violations) console.log(`${v.rule}  ${v.file}:${v.line}  ${v.message}`);
const rules = [...new Set(violations.map((v) => v.rule))].map(
	(rule) => `docs/architecture/rules.md#${rule.toLowerCase()}`
);
console.log(`\narch: ${violations.length} violation(s). Rules: ${rules.join(' ')}`);
process.exit(1);
