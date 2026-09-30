#!/usr/bin/env node
/* ============================================================================
   Brand check — does this set tell the truth?

   Three claims, each proved against the disk rather than against a list that
   could be edited to agree with itself:

     1. every page in the set is listed in the hub, and every page the hub lists
        exists
     2. every page states its question in #fb-page  (the estate's ground rule 3)
     3. the rasters on disk match marks.js                 (delegated to the
        one tool that renders them — not reimplemented here, because a second
        renderer is a second opinion about what the icon looks like)

   Run: node prototypes/brand-ui/brand-check.mjs
   ========================================================================== */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');

let bad = 0;
const fail = (m) => {
	bad++;
	console.log('  FAIL ' + m);
};
const ok = (m) => console.log('  ok   ' + m);
const section = (n, t) => console.log(`\n── ${n}. ${t} ──`);

const PAGES = ['theme.html', 'icon.html', 'og.html', 'copy.html'];
const onDisk = readdirSync(here).filter((f) => f.endsWith('.html') && f !== 'index.html').sort();

/* The palette, read out of calendar-ui/proto.css rather than restated here. A
   list in this file would be a list that can be edited to agree with itself,
   which is the failure every check in this repo exists to prevent. */
const PALETTE_SRC = join(here, '..', 'calendar-ui', 'proto.css');
const root = readFileSync(PALETTE_SRC, 'utf8').match(/:root\s*\{([\s\S]*?)\}/)[1];
const TOKENS = new Map(
	[...root.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})/g)].map((m) => [m[2].toLowerCase(), m[1]])
);
/* #fff is not a token and never was: calendar-ui's own hero writes it, and a
   paper white is the absence of a colour rather than another one. */
const ALLOWED = new Set(['#fff', '#ffffff', 'transparent', 'none']);

section(1, 'every colour here is a calendar-ui token');
{
	const offenders = [];

	// marks.js is the shipped artwork: every hex in it is a palette decision.
	for (const m of read('marks.js').matchAll(/'(#[0-9a-fA-F]{3,8})'/g)) {
		if (!TOKENS.has(m[1].toLowerCase())) offenders.push(`marks.js ${m[1]}`);
	}

	// For the pages, only STYLING is a palette decision. A hex inside <code> is
	// prose about the palette — "#dd5822" in a sentence saying theme_color is
	// wrong is the point of the sentence — so only <style> blocks and style=""
	// attributes are read.
	const HEX = /#[0-9a-fA-F]{3,8}\b/g;
	for (const p of ['index.html', ...PAGES]) {
		const src = read(p);
		const styling = [
			...[...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]),
			...[...src.matchAll(/style="([^"]*)"/g)].map((m) => m[1])
		].join('\n');
		for (const hex of styling.match(HEX) || []) {
			const h = hex.toLowerCase();
			if (!TOKENS.has(h) && !ALLOWED.has(h)) offenders.push(`${p} ${hex}`);
		}
	}

	const unique = [...new Set(offenders)];
	if (unique.length) fail(`colours that are not calendar-ui tokens: ${unique.join(', ')}`);
	else ok(`${TOKENS.size} tokens, no colour outside them`);
}

section(2, 'the two proto.css copies are the same file');
{
	// They are duplicates, not siblings, and nothing kept them in step: adding a
	// class to one silently desynced the palette from the other set. calendar-ui
	// is the reference.
	const a = readFileSync(join(here, '..', 'calendar-ui', 'proto.css'), 'utf8');
	const b = readFileSync(join(here, '..', 'app-ui', 'proto.css'), 'utf8');
	if (a !== b) {
		const at = a.split('\n');
		const bt = b.split('\n');
		const diff = at
			.map((l, i) => (l === bt[i] ? null : `line ${i + 1}: ${l.trim()}`))
			.filter(Boolean)
			.slice(0, 5);
		fail(`calendar-ui/proto.css and app-ui/proto.css have drifted — ${diff.join(' | ')}`);
	} else ok(`byte-identical, ${a.split('\n').length} lines`);
}

section(3, 'the hub and the directory agree');
{
	const hub = read('index.html');
	for (const p of PAGES) {
		if (!onDisk.includes(p)) fail(`hub lists ${p} and it is not on disk`);
		// the hub's page table is the link: it renders href="${p.file}" at runtime,
		// so the declaration is what has to be here, not a literal href
		else if (!hub.includes(`file: '${p}'`)) fail(`${p} is on disk but the hub never links it`);
	}
	for (const p of onDisk) {
		if (!PAGES.includes(p)) fail(`${p} is on disk and the hub does not list it`);
	}
	if (!bad) ok(`${PAGES.length} pages, both directions`);
}

section(4, 'every page states the question it exists to answer');
{
	const silent = onDisk.filter((p) => {
		const m = read(p).match(/id="fb-page">([\s\S]*?)<\/script>/);
		if (!m) return true;
		try {
			return !JSON.parse(m[1]).question;
		} catch {
			return true;
		}
	});
	if (silent.length) fail(`no stated question: ${silent.join(', ')}`);
	else ok(`all ${onDisk.length} pages state a question`);
}

section(5, 'the pages only reach for assets that exist');
{
	const missing = [];
	for (const p of ['index.html', ...PAGES]) {
		// <pre> holds example markup, not live references — the tag block on
		// og.html is a proposal written out, and its href is not a link the
		// browser will ever follow.
		const src = read(p).replace(/<pre[\s\S]*?<\/pre>/g, '');
		// Local hrefs and srcs only. Three things are deliberately skipped: the
		// ../ escapes that leave the set, absolute URLs, and anything still
		// holding a template placeholder — that is a rendered reference, and its
		// target is asserted by §1 and §4 instead of by guessing at it here.
		for (const m of src.matchAll(/(?:href|src)="([^"#][^"]*)"/g)) {
			const ref = m[1];
			if (/^(https?:|\/)/.test(ref) || ref.startsWith('../')) continue;
			if (ref.includes('${') || /\s/.test(ref)) continue;
			if (!existsSync(join(here, ref))) missing.push(`${p} -> ${ref}`);
		}
	}
	if (missing.length) fail(`assets that do not exist: ${missing.join(', ')}`);
	else ok('every local asset resolves');
}

section(6, 'the rasters match the marks');
{
	const r = spawnSync(process.execPath, [join(here, '..', '..', 'scripts', 'build-brand-rasters.mjs'), '--check'], {
		stdio: 'inherit'
	});
	if (r.status !== 0) fail('rasters are out of date — run: npm run brand:build');
	else ok('static/brand/ and rasters/ both match marks.js');
}

section(7, 'the card is a card');
{
	// 1200x630 is what every crawler and every timeline assumes. A card at any
	// other size gets cropped, and the crop is not obvious until it is shared.
	const og = read('marks.js');
	if (!/width: 1200[\s\S]*?height: 630/.test(og)) fail('OG is not declared 1200x630');
	else ok('declared 1200×630');
	const built = join(here, '..', '..', 'static', 'brand', 'og.png');
	if (!existsSync(built)) fail('static/brand/og.png is missing — run: npm run brand:build');
	else ok('static/brand/og.png exists');
}

console.log(bad ? `\n${bad} problem(s)\n` : '\nclean\n');
process.exit(bad ? 1 : 0);
