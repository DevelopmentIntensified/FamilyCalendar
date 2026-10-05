/* ============================================================================
   Tree check — does prototypes/index.html tell the truth about the disk?

   A tree that lies is worse than no tree, so every claim the tree makes about
   the filesystem is asserted here against the filesystem itself. The page
   carries annotations that cannot be derived (what a file is for, which real
   route a prototype came from), but everything derivable is derived.

   Run: node prototypes/tree-check.mjs
   ========================================================================== */
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');

let bad = 0;
const fail = (m) => { bad++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** strip module plumbing so a source can be eval'd as one script */
const flat = (s) => s.replace(/^\s*import[^;]+;\s*$/gm, '').replace(/^export /gm, '');

/* ── what is actually on disk ──────────────────────────────────────────── */
const onDisk = (rel) => readdirSync(join(here, rel), { withFileTypes: true })
	.map((d) => ({ name: d.name, dir: d.isDirectory() }))
	.filter((d) => d.name !== 'feedback')   // test scratch, regenerated per run
	.map((d) => ({ name: d.name, dir: d.dir }))
	.sort((a, b) => a.name.localeCompare(b.name));

/* The sets, DISCOVERED. This used to be a literal ['calendar-ui', 'app-ui'],
   which meant a third set was invisible to §1, §2 and §3 — the tree could
   claim pages that do not exist, and pages that do exist could go unmentioned,
   and the check would pass. A guard that cannot see the thing it guards is
   worse than no guard, so the directory is the list now. */
const SETS = readdirSync(here, { withFileTypes: true })
	.map((d) => d.name)
	.filter((n) => {
		if (n === 'feedback' || !statSync(join(here, n)).isDirectory()) return false;
		return readdirSync(join(here, n)).some((f) => f.endsWith('.html'));
	})
	.sort();

const DISK = Object.fromEntries(SETS.map((d) => [d, onDisk(d)]));
const ok2 = (m) => console.log('  ok   ' + m);

/* Pull the FILES table out of the page source without executing it. */
function declaredFiles() {
	const src = read('index.html');
	const block = src.slice(src.indexOf('const FILES = {'), src.indexOf('const ROLE = {'));
	if (!block.startsWith('const FILES')) return null;
	const out = {};
	for (const dir of SETS) {
		const start = block.indexOf(`'${dir}': [`);
		if (start < 0) { out[dir] = null; continue; }
		const open = block.indexOf('[', start);
		let depth = 0, i = open;
		for (; i < block.length; i++) {
			if (block[i] === '[') depth++;
			else if (block[i] === ']') { depth--; if (!depth) break; }
		}
		const rows = [...block.slice(open, i + 1).matchAll(/\['([^']+)',\s*'([^']+)',\s*'([^']*)'\]/g)];
		out[dir] = rows.map((m) => ({ name: m[1], kind: m[2], what: m[3] }));
	}
	return out;
}

console.log('\n── 1. every file on disk is in the tree ──');
/* Pages are covered by §3; the FILES table documents the supporting files —
   the engine, the data, the styles, the suites. So compare like with like. */
{
	const declared = declaredFiles();
	if (!declared) fail('could not read the FILES table from index.html');
	else {
		for (const dir of SETS) {
			if (!declared[dir]) { fail(`${dir}/ is not declared in the tree`); continue; }
			const listed = new Set(declared[dir].map((r) => r.name));
			const supporting = DISK[dir].filter((f) => !f.name.endsWith('.html'));
			const missing = supporting.filter((f) => !listed.has(f.name)).map((f) => f.name);
			if (missing.length) fail(`${dir}/ on disk but not in the tree: ${missing.join(', ')}`);
			else ok(`${dir}/ — all ${supporting.length} supporting files listed`);
		}
	}
}

console.log('\n── 2. nothing in the tree is missing from disk ──');
{
	const declared = declaredFiles();
	if (declared) {
		for (const dir of SETS) {
			const real = new Set(DISK[dir].map((f) => f.name));
			const ghosts = (declared[dir] || []).filter((r) => !real.has(r.name)).map((r) => r.name);
			if (ghosts.length) fail(`${dir}/ listed in the tree but not on disk: ${ghosts.join(', ')}`);
			else ok(`${dir}/ — no ghosts`);
		}
	}
}

console.log('\n── 3. every prototype the tree links to is a real page, and vice versa ──');
{
	const src = read('index.html');
	// pages are linked two ways: as a prototype row (file:) and as a set hub (href:)
	const linked = [...new Set([
		...[...src.matchAll(/file:\s*'([^']+\.html)'/g)].map((m) => m[1]),
		...[...src.matchAll(/href:\s*'([^']+\.html)'/g)].map((m) => m[1])
	])];
	const realPages = new Set(
		SETS.flatMap((d) => DISK[d].filter((f) => f.name.endsWith('.html')).map((f) => `${d}/${f.name}`))
	);
	const missing = linked.filter((h) => !realPages.has(h));
	if (missing.length) fail(`tree links to pages that do not exist: ${missing.join(', ')}`);
	else ok(`${linked.length} page links, all resolve`);

	// every real page is reachable from the tree
	const notLinked = [...realPages].filter((h) => !linked.includes(h));
	if (notLinked.length) fail(`pages on disk the tree never mentions: ${notLinked.join(', ')}`);
	else ok(`all ${realPages.size} pages on disk are reachable from the tree`);
}

console.log('\n── 4. the tree renders, and the view switch leaves exactly one pane ──');
{
	const dom = new JSDOM(read('index.html'), { url: 'https://x.test/index.html', runScripts: 'outside-only', pretendToBeVisual: true });
	dom.window.Element.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40, x: 0, y: 0 });
	try {
		const body = (read('index.html').match(/<script type="module">([\s\S]*?)<\/script>/) || [])[1];
		await dom.window.eval(flat(body));
		await sleep(30);
		const d = dom.window.document;

		if (!d.querySelector('.tree')) fail('no .tree rendered');
		const links = d.querySelectorAll('.tree a[href]');
		/* The floor used to be a literal 20 links, which was a proxy for "the tree is
	 * not broken". It cannot be a literal once pages are deliberately removed: on
	 * 2026-10-04 twenty-four were, and the correct answer is one link per page that
	 * actually exists. Sections 1-3 already prove the tree neither omits nor invents
	 * a page, so the only thing worth asserting here is that it is not empty. */
	const realPages = Object.keys(DISK).flatMap((s) =>
		DISK[s].filter((f) => f.name.endsWith('.html')).map((f) => `${s}/${f.name}`)
	);
	if (links.length < realPages.length)
		fail(`tree shows ${links.length} links but ${realPages.length} pages exist on disk`);
	else if (links.length === 0) fail('the tree rendered no links at all');
	else ok(`tree renders ${links.length} links for ${realPages.length} pages on disk`);

		// PANES is closed over, so exercise the switch the way a user would
		const buttons = d.querySelectorAll('.views button');
		if (buttons.length !== 3) fail(`expected 3 view buttons, found ${buttons.length}`);
		else {
			// only the view PANES are exclusive — the hero, the switch and the
			// rules card are chrome and stay put
			const vis = (n) => { for (let p = n; p; p = p.parentElement) if (p.style.display === 'none') return false; return true; };
			const panes = [...d.querySelectorAll('[data-pane]')];
			if (panes.length !== 3) fail(`expected 3 panes, found ${panes.length}`);
			for (const b of buttons) {
				b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
				await sleep(5);
				const visible = panes.filter(vis);
				if (visible.length !== 1) fail(`after clicking "${b.textContent.trim()}", ${visible.length} panes visible, expected 1`);
			}
			if (!bad) ok('each view shows exactly one pane');
		}
	} catch (e) {
		fail('tree did not render: ' + e.message.split('\n')[0]);
	}
}

console.log('\n── 5. the stated rules are the rules the estate obeys ──');
{
	const src = read('index.html');
	const stated = (src.match(/<li><b>/g) || []).length;
	if (stated < 6) fail(`only ${stated} rules stated, expected at least 6`);

	// Rule, REVISED 2026-10-04 by the owner: a rejected or incorporated
	// prototype is removed once its outcome is recorded. It used to be the
	// opposite - "the losers are the record", enforced by requiring a-warm-studio,
	// b-focus-sidebar and c-day-first to still be on disk. That rule is gone
	// because the owner overruled it: version control plus the tracker are the
	// record now, not the working tree.
	//
	// What replaced it is the weaker but still real check: every file on disk is
	// declared in the tree (section 1) and every tree link resolves (section 2),
	// so the estate cannot quietly accumulate undeclared or unreachable files.
	const goneStill = DISK['calendar-ui'] ?? [];
	const losers = ['a-warm-studio.html', 'b-focus-sidebar.html', 'c-day-first.html'];
	const stillThere = losers.filter((f) => goneStill.some((d) => d.name === f));
	if (stillThere.length)
		ok(`superseded variants still on disk (not yet removed): ${stillThere.join(', ')}`);
	else ok('superseded variants removed, as the owner ruled - the record is version control');

	// Rule: every VARIANT is one engine plus its own chrome, and the baseline is the
	// one page allowed to be standalone. Both rules described pages that no longer
	// exist, so both are retired rather than left to crash on a missing file.
	// Nothing replaces them: the surviving sets (app-ui, brand-ui) each have one
	// page kind, and their own checkers cover them.
	ok('variant/baseline engine rules retired - the pages they described were removed');

	// Rule: every prototype states the question it exists to answer.
	// Walked per set, not off a two-name literal: a page in a set this loop
	// does not know about has no question to check, and silently passing a page
	// nobody was ever asked to justify is the exact failure this rule exists for.
	const silent = SETS.flatMap((set) =>
		DISK[set]
			.filter((f) => f.name.endsWith('.html') && f.name !== 'index.html')
			.map((f) => `${set}/${f.name}`)
			.filter((rel) => {
				const s = readFileSync(join(here, ...rel.split('/')), 'utf8');
				const m = s.match(/id="fb-page">([\s\S]*?)<\/script>/);
				if (!m) return true;
				try { return !JSON.parse(m[1]).question; } catch { return true; }
			})
	);
	if (silent.length) fail(`page(s) with no stated question: ${silent.join(', ')}`);
	else ok(`every prototype across ${SETS.length} sets states the question it exists to answer`);

	// Rule: defects in the real app are shown, not smoothed over.
	const hub = read('app-ui/index.html');
	if (!/Broken in the real app|404/.test(hub)) fail('the app hub no longer surfaces the broken link');
	else ok('real defects are surfaced on the prototypes, not smoothed over');
}

console.log(bad ? `\n${bad} problems` : '\nclean');
process.exit(bad ? 1 : 0);
