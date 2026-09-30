/* Walk the whole tree over HTTP, the way a reviewer would, and prove every
   link lands on a page that renders. This is the check that would have caught
   "the other prototypes are not in the tree" before it reached the browser.

   Run: node prototypes/serve-check.mjs [port]        (default 4180)         */
import { JSDOM } from 'jsdom';

const PORT = process.argv[2] || '4180';
const BASE = `http://127.0.0.1:${PORT}`;
/** the directory a page lives in, with a trailing slash ('' at the root) */
const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
let bad = 0;
const fail = (m) => { bad++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);

console.log(`\n── 1. the tree is the entry point ──`);
{
	const r = await fetch(BASE + '/');
	if (!r.ok) fail(`GET / returned ${r.status}`);
	else {
		const t = await r.text();
		if (!/Prototype tree/.test(t)) fail('GET / is not the tree page');
		else ok('GET / serves the prototype tree');
	}
}

console.log('\n── 2. every page the tree links to is reachable and renders ──');
const html = await (await fetch(BASE + '/')).text();
const linked = [...new Set([...html.matchAll(/file:\s*'([^']+\.html)'/g)].map((m) => m[1]))];

for (const page of linked) {
	let res;
	try {
		res = await fetch(`${BASE}/${page}`);
	} catch (e) {
		fail(`${page} — ${e.message}`);
		continue;
	}
	if (!res.ok) { fail(`${page} — HTTP ${res.status}`); continue; }
	const body = await res.text();

	// the assets each page needs, resolved relative to the page
	const dir = page.includes('/') ? page.slice(0, page.lastIndexOf('/') + 1) : '';
	const assets = [
		...[...body.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]),
		...[...body.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1])
	].map((a) => dir + a);

	for (const a of assets) {
		const ar = await fetch(`${BASE}/${a}`);
		if (!ar.ok) fail(`${page} needs ${a} — HTTP ${ar.status}`);
	}
	ok(`${page.padEnd(40)} ${res.status}, ${assets.length} assets ok`);
}

console.log('\n── 3. every page runs its own module without throwing ──');
{
	// jsdom will not fetch, so the module graph is inlined first — the same
	// trick app-check.mjs uses. It has to be TRANSITIVE: the calendar pages go
	// page → proto-shell.js → proto-data.js, and pulling in only the first
	// level fails with "Cannot use import statement outside a module".
	const strip = (s) => s
		.replace(/^\s*import[\s\S]*?from\s*'[^']*';/gm, '')   // multi-line imports too
		.replace(/^\s*import\s*'[^']*';/gm, '')
		.replace(/^export\s+(?=(const|let|var|function|class|async))/gm, '')
		.replace(/^export\s*\{[^}]*\};?$/gm, '');

	const loaded = new Map();
	async function inline(url, seen = new Set()) {
		if (seen.has(url)) return '';
		seen.add(url);
		const r = await fetch(url);
		if (!r.ok) { fail(`${url} — HTTP ${r.status}`); return ''; }
		if (loaded.has(url)) return '';
		loaded.set(url, true);
		const src = await r.text();
		// depth first, so a dependency's own dependencies land before it
		const deps = [...new Set([...src.matchAll(/from\s*'(\.\/[^']+)'/g)].map((x) => x[1]))];
		let head = '';
		for (const d of deps) head += await inline(new URL(d, url).href, seen) + '\n;\n';
		return head + strip(src);
	}

	let ran = 0, staticOnly = 0;
	for (const page of linked) {
		const body = await (await fetch(`${BASE}/${page}`)).text();
		const m = body.match(/<script type="module">([\s\S]*?)<\/script>/);
		if (!m) { staticOnly++; continue; }
		loaded.clear();

		// inline each of the page's own imports, then the page itself
		let src = '';
		for (const dep of [...new Set([...m[1].matchAll(/from\s*'(\.\/[^']+)'/g)].map((x) => x[1]))]) {
			src += await inline(`${BASE}/${dirOf(page)}${dep.replace(/^\.\//, '')}`) + '\n;\n';
		}
		src += strip(m[1]);

		const dom = new JSDOM(body, { url: `${BASE}/${page}`, runScripts: 'outside-only', pretendToBeVisual: true });
		dom.window.Element.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40, x: 0, y: 0 });
		try {
			await dom.window.eval(src);
			await new Promise((r) => setTimeout(r, 20));
			if (dom.window.document.body.children.length < 2) fail(`${page} rendered an empty body`);
			else ran++;
		} catch (e) {
			fail(`${page} threw — ${e.message.split('\n')[0]}`);
		}
	}
	ok(`${ran} module pages ran, ${staticOnly} static, none empty`);
}


console.log('\n── 4. every set hub is a different page ──');
{
	// Two sets serving the same index.html means the collector is resolving them
	// to one file, and one set is invisible. Scoped to the tree's declared
	// sections, so a stray directory in prototypes/ cannot fail the estate.
	const tree = await (await fetch(BASE + '/')).text();
	const hubs = [...new Set([...tree.matchAll(/href:\s*'([^']+\/index\.html)'/g)].map((m) => m[1]))];
	const seen = new Map();
	for (const hub of hubs) {
		const res = await fetch(`${BASE}/${hub}`);
		if (!res.ok) { fail(`${hub} — HTTP ${res.status}`); continue; }
		const text = await res.text();
		if (seen.has(text)) fail(`${hub} and ${seen.get(text)} serve identical content`);
		else seen.set(text, hub);
	}
	if (!bad) ok(`${hubs.length} hubs, all distinct`);
}

console.log(bad ? `\n${bad} problems` : '\nclean');
process.exit(bad ? 1 : 0);
