#!/usr/bin/env node
// `node scripts/arch/auth-audit.mjs` — no auth DOWNGRADE when a legacy route is
// rewired to a v2 handler.
//
// No human reviews a port in this rewrite, so a route wired to a weaker kernel
// mode than legacy served would pass every other gate. This one compares the
// two sides from evidence only (no LLM, no network):
//
//   1. v2 handlers: every `export const … = endpoint({…}) / pageLoad({…}) /
//      formAction({…})` in src/lib/{domains,screens}/**/*.http.server.ts, with
//      its `auth:` value.
//   2. wired routes: src/routes/**/{+server,+page.server,+layout.server}.ts
//      exports that only point at one of those handlers (`… = foo.handler`,
//      `export const load = fooLoad`, `actions = { submit: fooAction }`).
//   3. legacy level at the S2 sha (66a11131) for the same route file and method:
//      admin evidence (`requireAdmin*`, `isAdminUser`, `roles.includes('admin')`,
//      403) else user evidence (`requireUser*`, `locals.user` null-check with
//      401/redirect to /login, `fail(401)`, `error(401)`) else none. Page loads
//      also inherit the level of their parent `+layout.server.ts` files (API
//      routes never run layouts), and every request inherits the legacy hooks
//      admin prefix (below).
//   4. compare admin > user > optional/public. A weaker v2 mode passes as
//      MANUAL-OK only when the legacy level was user and the v2 handler body
//      checks the actor itself (the `auth: 'optional'` pattern); an admin
//      downgrade is never MANUAL-OK. Everything else must be listed, with a
//      reason, in scripts/arch/auth-audit-allow.json.
//
//   node scripts/arch/auth-audit.mjs --ref <sha>   audit another tree (a port
//                                                  branch before it merges)
//
// Output: one line per wired route export
//   OK|MANUAL-OK|DOWNGRADE  <route-file>#<export>  legacy=<lvl> v2=<mode>  <handler>
// then a summary. Exit 1 on any unlisted DOWNGRADE (or on a handler it cannot
// resolve, so a silent miss cannot pass).
// Doc: docs/architecture/testing.md#gates
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, listFiles, readJson, stripComments } from './lib.mjs';

/** The S2 sha every port sheet records its goldens at: the legacy tree to compare against. */
const LEGACY_SHA = '66a11131';
const ALLOW_FILE = 'scripts/arch/auth-audit-allow.json';

const HANDLER_GLOB = /^src\/lib\/(?:domains|screens)\/.+\.http\.server\.ts$/;
const ROUTE_FILE = /^src\/routes\/(?:.+?)\/(?:\+server|\+page\.server|\+layout\.server)\.ts$|^src\/routes\/(?:\+layout\.server)\.ts$/;

/**
 * Legacy hooks gates, read from `src/hooks.server.ts` at 66a11131:
 *   l.23 `adminProtectedRoutes = ['admin']`; l.38 `isAdminRoute()` matches any
 *        path segment equal to 'admin'; l.72 redirects a session-less request to
 *        /login, l.118 redirects a signed-in non-admin to /login. So every
 *        request (page or /api) under an `admin` segment is admin level.
 *   l.24 `protectedRoutes = ['calendar','account','claim',…admin]` only creates
 *        an Anonymous Account for GET document navigations (l.84); it is not an
 *        auth gate and is deliberately NOT encoded as a level.
 */
const LEGACY_ADMIN_SEGMENTS = ['admin'];

/**
 * Kernel auth modes and their meaning, read from `src/lib/kernel/http/`:
 *   endpoint.server.ts:178-196 (`authorize`) — public: no actor, always allowed;
 *     optional: the actor or null (the handler refuses for itself); user:
 *     401 {error:'Unauthorized'} without one; admin: user plus `actor.isAdmin`,
 *     else 403 {error:'Forbidden'}; cron: `Authorization: Bearer CRON_SECRET`
 *     (an out-of-band secret, not a user level).
 *   pageHandlers.server.ts:58-61 — pageLoad user/admin redirect 302 /login,
 *     admin redirects a non-admin 302 /calendar; formAction (l.90-95) answers
 *     fail(401 'Not signed in') / fail(403 'Forbidden').
 * The rank orders the user-facing levels; `cron` ranks with `optional` because
 * it is a secret gate rather than a narrower user level.
 */
const RANK = { admin: 3, user: 2, optional: 1, cron: 1, public: 0, none: 0 };

const ADMIN_EVIDENCE = [
	/\brequireAdmin(?:Json|Action)?\s*\(/,
	/\bisAdminUser\s*\(/,
	/\bisAdmin\s*\(/,
	/roles\??\.(?:includes|some)\(\s*['"]admin['"]\s*\)/,
	/\berror\(\s*403\b/,
	/status:\s*403\b/
];

const USER_EVIDENCE = [
	/\brequireUser(?:Json|Action)?\s*\(/,
	/if\s*\(\s*!\s*(?:event\.)?locals\.user\b/,
	/(?:event\.)?locals\.user\s*(?:===?|!==?)\s*(?:null|undefined)/,
	/\bfail\(\s*401\b/,
	/\berror\(\s*401\b/,
	/\bstatus:\s*401\b/,
	/redirect\(\s*(?:302|303)\s*,\s*['"]\/login['"]/
];

/** The v2 handler body checks the actor itself before reading input. */
const MANUAL_CHECK = [
	/if\s*\(\s*!\s*actor\s*\)/,
	/if\s*\(\s*actor\s*===?\s*null\s*\)/,
	/\bthrow\s+unauthorized\s*\(/,
	/\bfail\(\s*401\b/,
	/\berror\(\s*401\b/,
	/\bstatus:\s*401\b/,
	/redirect\(\s*(?:302|303)\s*,\s*(?:LOGIN_PATH|['"]\/login['"])/
];

const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------
// Source access: the working tree by default, another commit with --ref.
// ---------------------------------------------------------------------------
const refIndex = process.argv.indexOf('--ref');
const REF =
	refIndex === -1
		? null
		: (process.argv[refIndex + 1] ??
			(() => {
				console.error('auth-audit: --ref needs a commit-ish');
				process.exit(2);
			})());

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** `git cat-file --batch` for a whole set of paths: one git process per audit. */
function batchRead(rev, files) {
	const wanted = [...new Set(files)].filter(Boolean);
	if (wanted.length === 0) return new Map();
	const input = `${wanted.map((file) => `${rev}:${file}`).join('\n')}\n`;
	const output = execFileSync('git', ['cat-file', '--batch'], {
		cwd: ROOT,
		input,
		stdio: ['pipe', 'pipe', 'ignore'],
		maxBuffer: 512 * 1024 * 1024
	});
	const texts = new Map();
	let offset = 0;
	for (const file of wanted) {
		const newline = output.indexOf(0x0a, offset);
		if (newline === -1) break;
		const header = output.toString('utf8', offset, newline);
		const size = Number(header.split(' ').at(-1));
		if (!header.includes(' blob ') || !Number.isFinite(size)) {
			texts.set(file, null);
			offset = newline + 1;
			continue;
		}
		const start = newline + 1;
		texts.set(file, output.toString('utf8', start, start + size));
		offset = start + size + 1;
	}
	return texts;
}

function listTreeFiles() {
	if (REF) return git(['ls-tree', '-r', '--name-only', REF]).split('\n').filter(Boolean);
	return listFiles();
}

/** Texts of the audited tree's files; absent paths map to null. */
function readTreeFiles(files) {
	if (REF) return batchRead(REF, files);
	const texts = new Map();
	for (const file of files) {
		const absolute = path.join(ROOT, file);
		texts.set(file, existsSync(absolute) ? readFileSync(absolute, 'utf8') : null);
	}
	return texts;
}

// ---------------------------------------------------------------------------
// Brace/string-aware scanning (no parser dependency).
// ---------------------------------------------------------------------------

/** Index of the bracket matching the one at `openIndex`, or -1. */
function matchingBracket(text, openIndex) {
	const closing = { '{': '}', '[': ']', '(': ')' };
	let depth = 0;
	let quote = null;
	for (let i = openIndex; i < text.length; i++) {
		const ch = text[i];
		const next = text[i + 1];
		if (quote) {
			if (ch === '\\') i++;
			else if (ch === quote) quote = null;
			continue;
		}
		if (ch === '/' && next === '/') {
			const newline = text.indexOf('\n', i);
			i = newline === -1 ? text.length : newline;
			continue;
		}
		if (ch === '/' && next === '*') {
			const end = text.indexOf('*/', i + 2);
			i = end === -1 ? text.length : end + 1;
			continue;
		}
		if (ch === "'" || ch === '"' || ch === '`') {
			quote = ch;
			continue;
		}
		if (ch === '{' || ch === '[' || ch === '(') depth++;
		else if (ch === '}' || ch === ']' || ch === ')') {
			depth--;
			if (depth === 0) return ch === closing[text[openIndex]] ? i : -1;
		}
	}
	return -1;
}

/** Split an object body (the text between its braces) into top-level entries. */
function topLevelEntries(inner) {
	const spans = [];
	let depth = 0;
	let quote = null;
	let start = 0;
	for (let i = 0; i < inner.length; i++) {
		const ch = inner[i];
		const next = inner[i + 1];
		if (quote) {
			if (ch === '\\') i++;
			else if (ch === quote) quote = null;
			continue;
		}
		if (ch === '/' && next === '/') {
			const newline = inner.indexOf('\n', i);
			i = newline === -1 ? inner.length : newline;
			continue;
		}
		if (ch === '/' && next === '*') {
			const end = inner.indexOf('*/', i + 2);
			i = end === -1 ? inner.length : end + 1;
			continue;
		}
		if (ch === "'" || ch === '"' || ch === '`') {
			quote = ch;
			continue;
		}
		if (ch === '{' || ch === '[' || ch === '(') depth++;
		else if (ch === '}' || ch === ']' || ch === ')') depth--;
		else if (ch === ',' && depth === 0) {
			spans.push([start, i]);
			start = i + 1;
		}
	}
	spans.push([start, inner.length]);

	const entries = [];
	for (const [from, to] of spans) {
		const raw = inner.slice(from, to);
		const colon = topLevelColon(raw);
		if (colon === -1) {
			const key = raw.trim();
			if (/^[A-Za-z_$][\w$]*$/.test(key)) entries.push({ key, value: key });
			continue;
		}
		const key = raw
			.slice(0, colon)
			.trim()
			.replace(/^['"]|['"]$/g, '');
		if (!/^[A-Za-z_$][\w$]*$/.test(key)) continue;
		entries.push({ key, value: raw.slice(colon + 1).trim() });
	}
	return entries;
}

/** First top-level `:` of a single entry (not inside brackets or strings). */
function topLevelColon(raw) {
	let depth = 0;
	let quote = null;
	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		const next = raw[i + 1];
		if (quote) {
			if (ch === '\\') i++;
			else if (ch === quote) quote = null;
			continue;
		}
		if (ch === '/' && next === '/') {
			const newline = raw.indexOf('\n', i);
			i = newline === -1 ? raw.length : newline;
			continue;
		}
		if (ch === '/' && next === '*') {
			const end = raw.indexOf('*/', i + 2);
			i = end === -1 ? raw.length : end + 1;
			continue;
		}
		if (ch === "'" || ch === '"' || ch === '`') {
			quote = ch;
			continue;
		}
		if (ch === '{' || ch === '[' || ch === '(') depth++;
		else if (ch === '}' || ch === ']' || ch === ')') depth--;
		else if (ch === ':' && depth === 0) return i;
	}
	return -1;
}

const quotedValue = (value) => {
	const match = value.match(/^['"]([A-Za-z]+)['"]/);
	return match ? match[1] : null;
};

// ---------------------------------------------------------------------------
// 1. v2 handlers
// ---------------------------------------------------------------------------

const HANDLER_DECL =
	/export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*(endpoint|pageLoad|formAction)\s*(?:<[^<>]*>)?\s*\(\s*\{/g;

/** Map handler export name → { name, kind, auth, manualCheck, file }. */
function readHandlers(files, texts) {
	const handlers = new Map();
	const duplicates = [];
	for (const file of files) {
		const text = texts.get(file);
		if (!text) continue;
		for (const match of text.matchAll(HANDLER_DECL)) {
			const openIndex = text.indexOf('{', match.index + match[0].length - 1);
			const closeIndex = matchingBracket(text, openIndex);
			if (closeIndex === -1) continue;
			const inner = text.slice(openIndex + 1, closeIndex);
			const authEntry = topLevelEntries(inner).find((entry) => entry.key === 'auth');
			const auth = authEntry ? quotedValue(authEntry.value) : null;
			const name = match[1];
			const handler = {
				name,
				kind: match[2],
				auth: auth ?? 'unknown',
				manualCheck: MANUAL_CHECK.some((pattern) => pattern.test(inner)),
				file
			};
			if (handlers.has(name)) duplicates.push(name);
			else handlers.set(name, handler);
		}
	}
	return { handlers, duplicates };
}

// ---------------------------------------------------------------------------
// 2. wired routes
// ---------------------------------------------------------------------------

/** `export const GET = foo.handler`, `export const load = fooLoad`, actions. */
function readWiring(fileText) {
	const bindings = new Map();
	for (const match of fileText.matchAll(/\bimport\s+(?:type\s+)?\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g)) {
		if (!match[2].startsWith('$lib/')) continue;
		for (const part of match[1].split(',')) {
			const clause = part.trim();
			if (!clause || clause.startsWith('type ')) continue;
			const [imported, local] = clause.split(/\s+as\s+/).map((piece) => piece.trim());
			if (imported) bindings.set(local ?? imported, imported);
		}
	}

	const wired = [];
	const actions = fileText.match(/export\s+const\s+actions\b[^=]*=\s*\{/);
	let actionEntries = [];
	if (actions) {
		const openIndex = fileText.indexOf('{', actions.index + actions[0].length - 1);
		const closeIndex = matchingBracket(fileText, openIndex);
		if (closeIndex !== -1) actionEntries = topLevelEntries(fileText.slice(openIndex + 1, closeIndex));
	}

	for (const [local, imported] of bindings) {
		const alias = escapeRe(local);

		for (const match of fileText.matchAll(
			new RegExp(`export\\s+const\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=;]+)?=\\s*${alias}\\.handler\\b`, 'g')
		)) {
			wired.push({ exportName: match[1], kind: 'endpoint', imported });
		}

		for (const match of fileText.matchAll(
			new RegExp(`export\\s+const\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=;]+)?=\\s*${alias}\\s*(?![.\\w([<>])`, 'g')
		)) {
			wired.push({ exportName: match[1], kind: 'pageLoad', imported });
		}

		for (const entry of actionEntries) {
			if (entry.value === local) {
				wired.push({ exportName: entry.key, kind: 'formAction', imported });
			}
		}
	}

	// A `.handler` or bare handler export we could not attribute would be a silent miss.
	const unresolved = [];
	for (const match of fileText.matchAll(
		/export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*([A-Za-z_$][\w$]*)\.handler\b/g
	)) {
		if (!bindings.has(match[2])) unresolved.push(`export const ${match[1]} = ${match[2]}.handler`);
	}
	return { wired, unresolved };
}

// ---------------------------------------------------------------------------
// 3. legacy level at the S2 sha
// ---------------------------------------------------------------------------

const levelOf = (text) => {
	if (!text) return 'none';
	const clean = stripComments(text);
	if (ADMIN_EVIDENCE.some((pattern) => pattern.test(clean))) return 'admin';
	if (USER_EVIDENCE.some((pattern) => pattern.test(clean))) return 'user';
	return 'none';
};

const maxLevel = (a, b) => (RANK[a] >= RANK[b] ? a : b);

/** The slice of one top-level export declaration (its next sibling ends it). */
function exportSlice(text, name) {
	const start = new RegExp(
		`^export\\s+(?:const|let|var|async\\s+function|function)\\s+${escapeRe(name)}\\b`,
		'm'
	).exec(text);
	if (!start) return null;
	const rest = text.slice(start.index + start[0].length);
	const next = /^(?:export\s|function\s|const\s|let\s|var\s|async\s+function\s)/m.exec(rest);
	return text.slice(start.index, start.index + start[0].length + (next ? next.index : rest.length));
}

/** Slice of one action inside `export const actions = { … }`. */
function actionSlice(text, name) {
	const actions = /export\s+const\s+actions\b[^=]*=\s*\{/.exec(text);
	if (!actions) return null;
	const openIndex = text.indexOf('{', actions.index + actions[0].length - 1);
	const closeIndex = matchingBracket(text, openIndex);
	if (closeIndex === -1) return null;
	const inner = text.slice(openIndex + 1, closeIndex);
	for (const entry of topLevelEntries(inner)) {
		if (entry.key === name) return entry.value;
	}
	return null;
}

/** `src/routes/(admin)/admin/bugs/+page.server.ts` → path segments (groups dropped). */
function routeSegments(file) {
	return file
		.replace(/^src\/routes/, '')
		.split('/')
		.filter(Boolean)
		.filter((segment) => !/^\(.*\)$/.test(segment))
		.filter((segment) => !/^\+.*\.ts$/.test(segment));
}

/** Parent `+layout.server.ts` files, deepest first, excluding the file itself. */
function ancestorLayouts(file) {
	const parts = file.split('/');
	const from = file.endsWith('/+layout.server.ts') ? parts.length - 2 : parts.length - 1;
	const out = [];
	for (let i = from; i >= 1; i--) {
		out.push(`${parts.slice(0, i).join('/')}/+layout.server.ts`);
	}
	return out;
}

function legacyLevel({ file, exportName, kind, legacyTexts }) {
	const routeSegmentsList = routeSegments(file);
	let level = routeSegmentsList.some((segment) => LEGACY_ADMIN_SEGMENTS.includes(segment))
		? 'admin'
		: 'none';

	if (kind !== 'endpoint') {
		for (const layoutFile of ancestorLayouts(file)) {
			const layoutText = legacyTexts.get(layoutFile);
			if (!layoutText) continue;
			level = maxLevel(level, levelOf(exportSlice(layoutText, 'load')));
		}
	}

	const legacyText = legacyTexts.get(file);
	if (!legacyText) return { level, absent: true };

	const slice =
		kind === 'endpoint'
			? exportSlice(legacyText, exportName)
			: kind === 'formAction'
				? actionSlice(legacyText, exportName)
				: exportSlice(legacyText, 'load');
	if (!slice) return { level, absent: false };
	return { level: maxLevel(level, levelOf(slice)), absent: false };
}

// ---------------------------------------------------------------------------
// 4. compare + report
// ---------------------------------------------------------------------------

function readAllowList() {
	const absolute = path.join(ROOT, ALLOW_FILE);
	if (!existsSync(absolute)) return [];
	const parsed = readJson(ALLOW_FILE);
	if (!Array.isArray(parsed)) throw new Error(`${ALLOW_FILE} must be a JSON array of { route, reason }`);
	for (const entry of parsed) {
		if (!entry || typeof entry.route !== 'string' || typeof entry.reason !== 'string' || !entry.reason.trim())
			throw new Error(`${ALLOW_FILE}: every entry needs a non-empty route and reason`);
	}
	return parsed;
}

function audit() {
	const files = listTreeFiles();
	const handlerFiles = files.filter((file) => HANDLER_GLOB.test(file));
	const routeFiles = files.filter((file) => ROUTE_FILE.test(file) && !/\.test\./.test(file));
	const { handlers, duplicates } = readHandlers(handlerFiles, readTreeFiles(handlerFiles));

	const routeTexts = readTreeFiles(routeFiles);
	const entries = [];
	const unresolved = [];
	let routeCount = 0;

	for (const file of routeFiles) {
		const text = routeTexts.get(file);
		if (!text) continue;
		const { wired, unresolved: routeUnresolved } = readWiring(text);
		for (const reference of routeUnresolved)
			unresolved.push({ key: `${file}#?`, detail: `${reference} is not imported from a module entry` });
		if (wired.length === 0) continue;
		routeCount += 1;

		for (const wiring of wired) {
			const handler = handlers.get(wiring.imported);
			const key =
				wiring.kind === 'formAction'
					? `${file}#actions.${wiring.exportName}`
					: `${file}#${wiring.exportName}`;
			if (!handler) {
				unresolved.push({ key, detail: `${wiring.imported} is not an exported handler in any *.http.server.ts` });
				continue;
			}
			entries.push({ file, wiring, handler, key });
		}
	}

	const legacyPaths = [];
	for (const entry of entries) {
		legacyPaths.push(entry.file);
		if (entry.wiring.kind !== 'endpoint') legacyPaths.push(...ancestorLayouts(entry.file));
	}
	const legacyTexts = batchRead(LEGACY_SHA, legacyPaths);

	const lines = [];
	let skippedAbsent = 0;
	for (const { file, wiring, handler, key } of entries) {
		const legacy = legacyLevel({ file, exportName: wiring.exportName, kind: wiring.kind, legacyTexts });
		if (legacy.absent) {
			skippedAbsent += 1;
			continue;
		}

		const legacyRank = RANK[legacy.level] ?? 0;
		const v2Rank = RANK[handler.auth] ?? 0;
		let status = 'OK';
		if (v2Rank < legacyRank) {
			const manualOk =
				legacy.level === 'user' &&
				v2Rank <= RANK.optional &&
				handler.manualCheck;
			status = manualOk ? 'MANUAL-OK' : 'DOWNGRADE';
		}
		lines.push({
			key,
			status,
			text: `${status}  ${key}  legacy=${legacy.level} v2=${handler.auth}  ${handler.name}`
		});
	}

	lines.sort((a, b) => a.key.localeCompare(b.key));
	const allow = new Map(readAllowList().map((entry) => [entry.route, entry.reason]));
	const failures = [];
	const manual = [];
	for (const line of lines) {
		if (line.status === 'MANUAL-OK') manual.push(line);
		if (line.status !== 'DOWNGRADE') continue;
		if (!allow.has(line.key)) failures.push(line);
	}
	const allowed = lines.filter((line) => line.status === 'DOWNGRADE' && allow.has(line.key));
	const stale = [...allow.keys()].filter((route) => !lines.some((line) => line.key === route));

	for (const line of lines) console.log(line.text);
	for (const problem of unresolved) console.log(`UNRESOLVED  ${problem.key}  ${problem.detail}`);
	for (const route of stale) console.log(`STALE-ALLOW  ${route}  (no wired route with a downgrade)`);

	const source = REF ? `ref ${REF}` : 'working tree';
	console.log(
		`\nauth audit ${LEGACY_SHA} → ${source}: ${lines.length} wired route exports in ${routeCount} routes`
	);
	console.log(
		`  OK ${lines.filter((line) => line.status === 'OK').length}  MANUAL-OK ${manual.length}  ` +
			`DOWNGRADE ${lines.filter((line) => line.status === 'DOWNGRADE').length} ` +
			`(${allowed.length} allow-listed)  skipped: ${skippedAbsent} new/absent at shas`
	);
	if (duplicates.length > 0) console.log(`  duplicate handler exports (R11 should have caught): ${duplicates.join(', ')}`);

	const blocked = failures.length > 0 || unresolved.length > 0 || stale.length > 0 || duplicates.length > 0;
	if (blocked) {
		const parts = [];
		if (failures.length) parts.push(`${failures.length} unlisted downgrade(s)`);
		if (unresolved.length) parts.push(`${unresolved.length} unresolved handler(s)`);
		if (stale.length) parts.push(`${stale.length} stale allow entr(ies)`);
		if (duplicates.length) parts.push(`${duplicates.length} duplicate handler name(s)`);
		console.log(`FAIL — ${parts.join(', ')}`);
		return 1;
	}
	console.log('OK — no auth downgrade');
	return 0;
}

try {
	process.exitCode = audit();
} catch (error) {
	console.error(`auth-audit: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 2;
}
