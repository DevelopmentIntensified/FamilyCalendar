// Shared helpers for scripts/arch/*: file listing, import parsing, path
// classification. No dependencies beyond Node. Doc: docs/architecture/rules.md
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILE_ROLES, LEGACY_PREFIXES, MODULES } from './registry.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const V2_ROOTS = ['src/lib/kernel/', 'src/lib/domains/', 'src/lib/screens/', 'src/lib/app/'];

/** Repo-relative POSIX paths of tracked + untracked (not ignored) files that exist on disk. */
export function listFiles() {
	const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
		cwd: ROOT,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024
	});
	return [
		...new Set(
			out
				.split('\n')
				.map((line) => line.trim())
				.filter(Boolean)
		)
	]
		.filter((file) => existsSync(path.join(ROOT, file)))
		.sort();
}

export function readText(file) {
	return readFileSync(path.join(ROOT, file), 'utf8');
}

export const CODE_EXT = /\.(ts|js|mjs|svelte)$/;
export const isCode = (file) => CODE_EXT.test(file);
export const isTest = (file) => /\.(test|spec)\.[jt]s$/.test(file);
export const isV2 = (file) => V2_ROOTS.some((root) => file.startsWith(root));
export const isRouteFile = (file) => file.startsWith('src/routes/');
export const isLegacy = (file) =>
	LEGACY_PREFIXES.some((prefix) => file === prefix || file.startsWith(prefix));

/** Drop comments so token rules do not fire on prose. Keeps line count. */
export function stripComments(text) {
	return text
		.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ''))
		.replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')
		.replace(/<!--[\s\S]*?-->/g, (block) => block.replace(/[^\n]/g, ''));
}

const IMPORT_RE =
	/(?:^|[\s;])(import|export)\s+(type\s+)?([\w*\s{},$]*?)\s*from\s*['"]([^'"]+)['"]|(?:^|[\s;])import\s*['"]([^'"]+)['"]|\b(import|vi\.mock|vi\.doMock)\s*\(\s*['"]([^'"]+)['"]/g;

/**
 * Every import-ish reference in a source file:
 * { spec, typeOnly, names: [imported names], line, kind: 'static'|'dynamic'|'mock' }
 */
export function parseImports(text) {
	const results = [];
	for (const match of text.matchAll(IMPORT_RE)) {
		const line = text.slice(0, match.index).split('\n').length;
		if (match[4]) {
			const clause = match[3] ?? '';
			const braced = clause.match(/\{([\s\S]*)\}/);
			const names = braced
				? braced[1]
						.split(',')
						.map((part) => part.trim())
						.filter(Boolean)
						.map((part) =>
							part
								.replace(/^type\s+/, '')
								.split(/\s+as\s+/)[0]
								.trim()
						)
				: [];
			const allTyped =
				braced &&
				!clause
					.replace(/\{[\s\S]*\}/, '')
					.replace(/,/g, '')
					.trim() &&
				braced[1]
					.split(',')
					.map((part) => part.trim())
					.filter(Boolean)
					.every((part) => part.startsWith('type '));
			results.push({
				spec: match[4],
				typeOnly: Boolean(match[2]) || Boolean(allTyped),
				names,
				line,
				kind: 'static'
			});
		} else if (match[5]) {
			results.push({ spec: match[5], typeOnly: false, names: [], line, kind: 'static' });
		} else if (match[7]) {
			results.push({
				spec: match[7],
				typeOnly: false,
				names: [],
				line,
				kind: match[6] === 'import' ? 'dynamic' : 'mock'
			});
		}
	}
	return results;
}

const EXTENSIONS = [
	'',
	'.ts',
	'.js',
	'.svelte',
	'.svelte.ts',
	'.mjs',
	'/index.ts',
	'/index.js',
	'.json'
];

/** Resolve `$lib/...` and relative specifiers to repo files; null for packages / $app / $env. */
export function resolveSpec(fromFile, spec, fileSet) {
	const clean = spec.split('?')[0];
	let base;
	if (clean === '$lib' || clean.startsWith('$lib/')) base = `src/lib${clean.slice(4)}`;
	else if (clean.startsWith('.'))
		base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), clean));
	else return null;
	for (const ext of EXTENSIONS) if (fileSet.has(base + ext)) return base + ext;
	if (base.endsWith('.js') && fileSet.has(base.slice(0, -3) + '.ts'))
		return base.slice(0, -3) + '.ts';
	return `?${base}`;
}

/**
 * Where a v2 file lives:
 * { area: 'kernel'|'domain'|'screen'|'app'|'route'|'legacy'|'other', module, role, isServer, isEntry }
 */
export function locate(file) {
	const parts = file.split('/');
	const base = parts.at(-1);
	const isServer =
		/\.server\.(ts|js)$/.test(base) ||
		base.startsWith('+server.') ||
		/^\+(page|layout)\.server\./.test(base);
	if (file.startsWith('src/lib/kernel/'))
		return { area: 'kernel', module: 'kernel', role: null, isServer, isEntry: false };
	if (file.startsWith('src/lib/app/'))
		return { area: 'app', module: 'app', role: null, isServer, isEntry: false };
	for (const [prefix, area] of [
		['src/lib/domains/', 'domain'],
		['src/lib/screens/', 'screen']
	]) {
		if (file.startsWith(prefix)) {
			const module = parts[3];
			const inUi = parts[4] === 'ui';
			const isEntry =
				(parts.length === 5 && (base === 'index.ts' || base === 'index.server.ts')) ||
				(inUi && parts.length === 6 && base === 'index.ts');
			return { area, module, role: inUi ? 'ui' : roleOf(module, base), isServer, isEntry };
		}
	}
	if (isRouteFile(file))
		return { area: 'route', module: null, role: null, isServer, isEntry: false };
	if (isLegacy(file)) return { area: 'legacy', module: null, role: null, isServer, isEntry: false };
	return { area: 'other', module: null, role: null, isServer, isEntry: false };
}

/** `tasks.cursor.rules.ts` -> 'rules'; `tasks.repo.server.ts` -> 'repo'; index/README -> 'index'/'doc'; else null. */
export function roleOf(module, base) {
	if (base === 'README.md') return 'doc';
	if (base === 'index.ts' || base === 'index.server.ts') return 'index';
	const stem = base
		.replace(/\.(db\.)?test\.ts$/, '.ts')
		.replace(/\.svelte\.ts$/, '.ts')
		.replace(/\.server\.ts$/, '.ts');
	const pieces = stem.replace(/\.ts$/, '').split('.');
	if (pieces[0] !== module || pieces.length < 2) return null;
	const role = pieces.at(-1);
	return FILE_ROLES.includes(role) ? role : null;
}

export const moduleNames = new Set(MODULES.map((module) => module.name));

export function readJson(file) {
	return JSON.parse(readText(file));
}

/** Markdown links `[text](target)` with their line numbers. */
export function markdownLinks(text) {
	const links = [];
	const lines = text.split('\n');
	let inFence = false;
	lines.forEach((line, index) => {
		if (/^\s*```/.test(line)) inFence = !inFence;
		if (inFence) return;
		for (const match of line
			.replace(/`[^`]*`/g, '')
			.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
			links.push({ target: match[1], line: index + 1 });
		}
	});
	return links;
}
