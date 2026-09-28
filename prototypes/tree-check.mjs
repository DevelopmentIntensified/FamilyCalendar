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

const DISK = { 'calendar-ui': onDisk('calendar-ui'), 'app-ui': onDisk('app-ui') };

/* Pull the FILES table out of the page source without executing it. */
function declaredFiles() {
	const src = read('index.html');
	const block = src.slice(src.indexOf('const FILES = {'), src.indexOf('const ROLE = {'));
	if (!block.startsWith('const FILES')) return null;
	const out = {};
	for (const dir of ['calendar-ui', 'app-ui']) {
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
		for (const dir of ['calendar-ui', 'app-ui']) {
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
		for (const dir of ['calendar-ui', 'app-ui']) {
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
	const realPages = new Set([
		...DISK['calendar-ui'].filter((f) => f.name.endsWith('.html')).map((f) => 'calendar-ui/' + f.name),
		...DISK['app-ui'].filter((f) => f.name.endsWith('.html')).map((f) => 'app-ui/' + f.name)
	]);
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
		if (links.length < 20) fail(`only ${links.length} links in the tree, expected at least 20`);
		else ok(`tree rendered with ${links.length} links`);

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

	// Rule: a review produces a synthesis, not a patch — so the rejected
	// variants must still be on disk. They are the record of the argument.
	const losers = ['a-warm-studio.html', 'b-focus-sidebar.html', 'c-day-first.html'];
	const gone = losers.filter((f) => !DISK['calendar-ui'].some((d) => d.name === f));
	if (gone.length) fail(`a rejected prototype was deleted: ${gone.join(', ')} — the losers are the record`);
	else ok(`all ${losers.length} rejected variants still on disk`);

	// Rule: every VARIANT is one engine plus its own chrome. The baseline is
	// the exception — it has to reproduce the shipped page, not a prototype of
	// it, so it is deliberately standalone.
	const variants = ['a-warm-studio.html', 'b-focus-sidebar.html', 'c-day-first.html', 'd-working-calendar.html'];
	const noEngine = variants.filter((f) => !/proto-shell\.js/.test(readFileSync(join(here, 'calendar-ui', f), 'utf8')));
	if (noEngine.length) fail(`variant(s) not using the shared engine: ${noEngine.join(', ')}`);
	else ok(`all ${variants.length} variants are the shared engine plus their own chrome`);

	// …and the baseline is the one page that is allowed to be standalone.
	const base = readFileSync(join(here, 'calendar-ui', '0-current.html'), 'utf8');
	if (/proto-shell\.js/.test(base)) fail('0-current.html uses the engine — it must reproduce the shipped page, not a prototype of it');
	else ok('the baseline stays standalone, because it reproduces the shipped page');

	// Rule: every prototype states the question it exists to answer.
	const silent = [...DISK['calendar-ui'], ...DISK['app-ui']]
		.filter((f) => f.name.endsWith('.html') && f.name !== 'index.html')
		.filter((f) => {
			const dir = DISK['calendar-ui'].includes(f) ? 'calendar-ui' : 'app-ui';
			const s = readFileSync(join(here, dir, f.name), 'utf8');
			const m = s.match(/id="fb-page">([\s\S]*?)<\/script>/);
			if (!m) return true;
			try { return !JSON.parse(m[1]).question; } catch (e) { return true; }
		});
	if (silent.length) fail(`page(s) with no stated question: ${silent.map((f) => f.name).join(', ')}`);
	else ok('every prototype states the question it exists to answer');

	// Rule: defects in the real app are shown, not smoothed over.
	const hub = read('app-ui/index.html');
	if (!/Broken in the real app|404/.test(hub)) fail('the app hub no longer surfaces the broken link');
	else ok('real defects are surfaced on the prototypes, not smoothed over');
}

console.log(bad ? `\n${bad} problems` : '\nclean');
process.exit(bad ? 1 : 0);
