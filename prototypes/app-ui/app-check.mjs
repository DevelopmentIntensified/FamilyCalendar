/* Structural + render checks for the app prototypes.
   Derives the page list from the directory, so adding a page cannot go stale.
   Run: node prototypes/app-ui/app-check.mjs                                     */
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PAGES = readdirSync(here).filter((f) => f.endsWith('.html')).sort();

/* Pages the nav and cross-links point at that are not built yet. Listed so the
   gap is visible instead of silently passing, but not treated as a failure. */
const PENDING = new Set();   // empty: every page the set links to now exists

let bad = 0;
const fail = (m) => { bad++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (p) => readFileSync(join(here, p), 'utf8');
/** strip module plumbing so the source can be eval'd as one script */
const flat = (s) => s.replace(/^\s*import[^;]+;\s*$/gm, '').replace(/^export /gm, '');

console.log(`\n── 1. all ${PAGES.length} pages are wired ──`);
for (const f of PAGES) {
	const src = read(f);
	const issues = [];
	if (!/proto\.css/.test(src)) issues.push('no proto.css');
	if (!/feedback\.css/.test(src)) issues.push('no feedback.css');
	if (!/drag\.js/.test(src)) issues.push('no drag.js');
	if (!/feedback\.js/.test(src)) issues.push('no feedback.js');
	if (src.indexOf('drag.js') > src.indexOf('feedback.js')) issues.push('drag.js loads after feedback.js');

	const m = src.match(/<script type="application\/json" id="fb-page">([\s\S]*?)<\/script>/);
	if (!m) issues.push('no readable #fb-page identity block');
	else {
		try {
			const j = JSON.parse(m[1]);
			if (!j.label) issues.push('identity has no label');
			if (!j.question) issues.push('identity has no question');
			if (!j.family) issues.push('identity has no family');
		} catch (e) { issues.push('identity is not valid JSON: ' + e.message); }
	}
	issues.length ? fail(`${f} — ${issues.join(', ')}`) : ok(f);
}

console.log('\n── 2. every page renders, and the shell mounts ──');
for (const f of PAGES) {
	const dom = new JSDOM(read(f), { url: 'https://x.test/' + f, runScripts: 'outside-only', pretendToBeVisual: true });
	dom.window.Element.prototype.getBoundingClientRect = function () {
		return { left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40, x: 0, y: 0 };
	};
	try {
		const body = (read(f).match(/<script type="module">([\s\S]*?)<\/script>/) || [])[1];
		if (!body) { fail(`${f} has no module script`); continue; }
		// ONE eval, so top-level consts share a scope — separate evals do not.
		await dom.window.eval([flat(read('app-data.js')), flat(read('app-shell.js')), flat(body)].join('\n;\n'));
		await sleep(20);
		const d = dom.window.document;
		if (!d.querySelector('.navbar')) fail(`${f} — shell did not mount the navbar`);
		else if (!d.querySelector('[data-fb]')) fail(`${f} — no data-fb markers in the rendered output`);
		else ok(`${f.padEnd(20)} ${String(d.querySelectorAll('[data-fb]').length).padStart(2)} regions, ${d.querySelectorAll('a[href]').length} links`);
	} catch (e) {
		fail(`${f} — ${e.message.split('\n')[0]}`);
	}
}

console.log('\n── 3. internal page links resolve ──');
{
	const files = new Set(PAGES);
	const missing = new Set();
	for (const f of PAGES) {
		for (const h of new Set([...read(f).matchAll(/href="([^"#][^"]*)"/g)].map((m) => m[1]))) {
			if (/^(https?:|mailto:|\.\.\/|\/)/.test(h)) continue;  // external, cross-set, or an app route
			if (!h.endsWith('.html')) continue;                     // css and other assets
			if (h.includes('{')) continue;                          // the app's own templated href
			if (files.has(h)) continue;
			missing.add(h);
		}
	}
	const unexpected = [...missing].filter((h) => !PENDING.has(h));
	if (unexpected.length) fail(`links to pages that are neither built nor pending: ${unexpected.join(', ')}`);
	else ok(`no broken links · ${missing.size} target(s) still to build: ${[...missing].sort().join(', ') || 'none'}`);
}

console.log('\n── 4. the nav reproduces the real one, gaps included ──');
{
	const shell = read('app-shell.js');
	const top = shell.match(/TOP_NAV = \[([\s\S]*?)\];/);
	const bottom = shell.match(/BOTTOM_NAV = \[([\s\S]*?)\];/);
	if (!top || !bottom) fail('could not read the nav tables');
	else {
		const T = top[1], B = bottom[1];
		// #065: one destination list feeds both navs. Groceries is in BOTH, the
		// bottom nav under the short label "Shop" so six tabs fit 320px, and
		// Alerts is in both. The old divergence (Groceries desktop-only) is
		// fixed in the app, so reproducing it here would be showing a bug that
		// no longer exists.
		if (!/Groceries/.test(T)) fail('top nav is missing Groceries (navItems.ts)');
		if (!/label: 'Alerts'/.test(T)) fail('top nav is missing Alerts (navItems.ts)');
		if (!/label: 'Alerts'/.test(B)) fail('bottom nav is missing Alerts (BottomNav.svelte)');
		if (!/label: 'Shop'/.test(B)) fail("bottom nav is missing Groceries under the short label 'Shop'");
		if (/label: 'Groceries'/.test(B)) {
			fail("bottom nav should use the SHORT label 'Shop' at 320px, not the full word");
		}
		// Six tabs is the ceiling the app was measured at.
		const tabs = (B.match(/label: '/g) || []).length;
		if (tabs !== 6) fail(`bottom nav has ${tabs} tabs, expected 6`);
		ok('both navs reach every destination — one list feeds both, 6 tabs fit 320px');
	}
}

console.log('\n── 5. the model reference matches the schema ──');
{
	// Read the real table list out of schema.ts so the two cannot drift.
	const schema = readFileSync(join(here, '..', '..', 'src', 'lib', 'server', 'db', 'schema.ts'), 'utf8');
	const real = new Set([...schema.matchAll(/export const (\w+) = pgTable\(/g)].map((m) => m[1]));

	const data = read('app-data.js');
	const groups = (data.match(/id: '\w+',\s*label: '[^']+',\s*tone:/g) || []).length;
	// one row per table, except the "parked" rows which name several at once
	const rows = [...data.matchAll(/\n\t\t\t\{ name: '([^']+)'/g)].map((m) => m[1]);
	const modelled = rows.flatMap((n) => n.split('·').map((s) => s.trim()));

	const dupes = modelled.filter((n, i) => modelled.indexOf(n) !== i);
	const notInSchema = modelled.filter((n) => !real.has(n));
	const notModelled = [...real].filter((n) => !modelled.includes(n));

	if (dupes.length) fail(`table listed twice: ${[...new Set(dupes)].join(', ')}`);
	if (notInSchema.length) fail(`modelled but not in schema.ts: ${notInSchema.join(', ')}`);
	if (notModelled.length) fail(`in schema.ts but not modelled: ${notModelled.join(', ')}`);
	if (groups !== 7) fail(`expected 7 model groups, found ${groups}`);
	if (!dupes.length && !notInSchema.length && !notModelled.length && groups === 7) {
		ok(`${groups} groups, ${rows.length} rows, ${modelled.length} tables — exactly matches schema.ts`);
	}
}
console.log('\n── 6. the hub lists every page, and only real pages ──');
{
	const hub = read('index.html');
	const listed = [...hub.matchAll(/\{ file: '([^']+)'/g)].map((m) => m[1]);
	const files = new Set(PAGES.filter((f) => f !== 'index.html'));
	const notListed = [...files].filter((f) => !listed.includes(f));
	const notReal = listed.filter((f) => !PAGES.includes(f));
	if (notListed.length) fail(`built but not on the hub: ${notListed.join(', ')}`);
	if (notReal.length) fail(`on the hub but not built: ${notReal.join(', ')}`);
	if (!notListed.length && !notReal.length) ok(`${listed.length} pages, hub and directory agree`);
}

console.log('\n── 7. account.html hash sections have ids the nav can reach ──');
{
	// Regression guard: the sections are written as markup strings, so nothing
	// guarantees an id. Without them show() hides every section on load.
	const src = read('account.html');
	const nav = [...src.matchAll(/data-s="([^"]+)"/g)].map((m) => m[1]);
	const assigns = /SECTIONS\.forEach\(\(s, i\) => \{ if \(secs\[i\]\) secs\[i\]\.id = s\.id; \}\)/.test(src);
	if (!nav.length) fail('could not read the section nav');
	else if (!assigns) fail('sections are never given ids — show() will hide all of them');
	else {
		const dom = new JSDOM(read('account.html'), { url: 'https://x.test/account.html', runScripts: 'outside-only', pretendToBeVisual: true });
		dom.window.Element.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40, x: 0, y: 0 });
		await dom.window.eval([flat(read('app-data.js')), flat(read('app-shell.js')), flat((read('account.html').match(/<script type="module">([\s\S]*?)<\/script>/) || [])[1])].join('\n;\n'));
		await sleep(20);
		const shown = dom.window.document.querySelectorAll('.sec.is-on');
		if (shown.length !== 1) fail(`expected exactly 1 visible section, found ${shown.length}`);
		else ok(`${nav.length} sections, exactly one visible on load (${shown[0].id})`);
	}
}

console.log('\n── 8. the feedback store keys on the path, not the filename ──');
{
	// Both prototype sets ship an index.html. A store keyed on the basename
	// merges their notes into one record, so a note can no longer be attributed
	// to the prototype it was written about.
	const fb = readFileSync(join(here, 'feedback.js'), 'utf8');
	const skill = 'C:/Users/MIRP/.agents/skills/prototype/assets/feedback/feedback.js';
	if (readFileSync(skill, 'utf8') !== fb) fail('feedback.js has drifted from the skill asset');
	else {
		// publish the key from inside the IIFE, where pageFile is in scope
		const ANCHOR = '\tfunction typing(e) {';
		if (!fb.includes(ANCHOR)) fail('could not find an anchor to publish the page key');
		const probe = fb.replace(ANCHOR, '\tdocument.documentElement.dataset.probeKey = pageFile();\n' + ANCHOR);
		const keyOf = (pathname) => {
			const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test' + pathname, runScripts: 'outside-only', pretendToBeVisual: true });
			dom.window.Element.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 10, height: 10, right: 10, bottom: 10, x: 0, y: 0 });
			dom.window.eval(probe);
			return dom.window.document.documentElement.dataset.probeKey;
		};

		const want = {
			'/': 'index.html',
			'/index.html': 'index.html',
			'/d-working-calendar.html': 'd-working-calendar.html',
			'/app-ui': 'app-ui/index.html',
			'/app-ui/': 'app-ui/index.html',
			'/app-ui/index.html': 'app-ui/index.html',
			'/app-ui/dashboard.html': 'app-ui/dashboard.html'
		};
		for (const [url, expect] of Object.entries(want)) {
			const got = keyOf(url);
			if (got !== expect) fail(`key for ${url} is "${got}", expected "${expect}"`);
		}
		if (keyOf('/app-ui/index.html') === keyOf('/index.html')) fail('the two index.html pages still share a key');
		else ok('keys are path-scoped, so both index.html pages stay separate');
	}
}

console.log('\n── 9. every page loads the dock, and it is collapsed ──');
{
	// Same contract as the calendar set, asserted here too: one page that
	// forgets the dock is a page with two always-on bars, which is the thing
	// dock-check.mjs exists to prevent.
	for (const f of PAGES) {
		const src = read(f);
		const issues = [];
		if (!/dock\.js/.test(src)) issues.push('no dock.js');
		if (src.indexOf('drag.js') > src.indexOf('dock.js')) issues.push('drag.js loads after dock.js');
		issues.length ? fail(`${f} — ${issues.join(', ')}`) : null;
	}
	const wired = PAGES.filter((f) => /dock\.js/.test(read(f))).length;
	if (wired !== PAGES.length) fail(`only ${wired} of ${PAGES.length} pages load dock.js`);
	else ok(`all ${PAGES.length} pages load the dock`);

	// and the shared assets have not drifted from the skill copies
	const skill = 'C:/Users/MIRP/.agents/skills/prototype/assets/feedback/';
	for (const f of ['feedback.js', 'drag.js', 'dock.js']) {
		if (readFileSync(skill + f, 'utf8') !== read(f)) fail(`${f} has drifted from the skill asset`);
	}
	ok('feedback.js, drag.js and dock.js match the skill assets');
}

console.log(bad ? `\n${bad} problems` : '\nclean');
process.exit(bad ? 1 : 0);