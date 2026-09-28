/* Structural lint for the prototypes: unbalanced tags, dangling local
   references, duplicate ids, and a headless render of each page's view host.
   Run: node prototypes/calendar-ui/lint.mjs */
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith('.html')).sort();
let problems = 0;
const bad = (f, msg) => { problems++; console.log(`  FAIL ${f.padEnd(24)} ${msg}`); };
const good = (f, msg) => console.log(`  ok   ${f.padEnd(24)} ${msg}`);

console.log('\n── 1. tag balance + local refs ──');
for (const f of files) {
	const src = readFileSync(join(here, f), 'utf8');
	const dom = new JSDOM(src);
	const d = dom.window.document;

	// tag balance
	const voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr','path','circle','rect','line','polyline','polygon','use','stop','ellipse']);
	const stack = [];
	let unbalanced = null;
	const walk = (n) => {
		for (const c of n.children) {
			const tag = c.localName;
			if (voids.has(tag)) continue;
			if (c.localName === 'svg') { walk(c); continue; }
			stack.push(tag);
			walk(c);
			stack.pop();
		}
	};
	// jsdom auto-corrects, so instead count open/close for the container divs we author
	const opens = (src.match(/<div\b/g) || []).length;
	const closes = (src.match(/<\/div>/g) || []).length;
	if (opens !== closes) unbalanced = `div ${opens} open vs ${closes} close`;

	// local file refs
	const missing = [];
	for (const el of d.querySelectorAll('[href], [src]')) {
		const v = el.getAttribute('href') || el.getAttribute('src');
		if (!v || /^(#|https?:|mailto:)/.test(v)) continue;
		const target = v.split('#')[0];
		try { readFileSync(join(here, target)); } catch { missing.push(target); }
	}

	// duplicate ids
	const ids = [...d.querySelectorAll('[id]')].map((n) => n.id);
	const dupes = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];

	// a11y-ish: icon-only buttons with no accessible name
	const unnamed = [...d.querySelectorAll('button')].filter(
		(b) => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')
	).length;

	const issues = [unbalanced, missing.length ? `missing refs: ${[...new Set(missing)].join(', ')}` : null,
		dupes.length ? `duplicate ids: ${dupes.join(', ')}` : null].filter(Boolean);
	if (issues.length) bad(f, issues.join(' · '));
	else good(f, `${d.querySelectorAll('*').length} nodes, ${ids.length} ids, no dangling refs${unnamed ? `, ${unnamed} unnamed buttons` : ''}`);
	void walk; void stack;
}

console.log('\n── 2. view host renders in jsdom ──');
globalThis.window = undefined;
for (const f of ['a-warm-studio.html', 'b-focus-sidebar.html', 'c-day-first.html']) {
	const dom = new JSDOM(readFileSync(join(here, f), 'utf8'), { url: 'https://x.test/' });
	globalThis.window = dom.window;
	globalThis.document = dom.window.document;
	globalThis.HTMLElement = dom.window.HTMLElement;
	globalThis.Element = dom.window.Element;
	globalThis.MouseEvent = dom.window.MouseEvent;
	globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
	// bust the module cache so each page re-imports against its own document
	const shell = pathToFileURL(join(here, 'proto-shell.js')).href;
	const { mount } = await import(`${shell}?t=${f}`);
	try {
		const host = dom.window.document.getElementById('view');
		if (!host) throw new Error('no #view element');
		const legend = dom.window.document.getElementById('legend') ?? dom.window.document.getElementById('legendInline');
		const rail = dom.window.document.getElementById('railDesktop');
		const api = mount({ viewHost: host, legendHost: legend, railHost: rail, railMode: !!rail });
		const counts = {};
		for (const v of ['month', 'week', 'day', 'list']) {
			api.state.view = v;
			api.draw();
			counts[v] = host.querySelectorAll('.chip, .wk__ev, .nextrow').length;
		}
		api.state.view = 'month';
		api.draw();
		if (legend && !legend.children.length) throw new Error('legend empty');
		if (rail && !dom.window.document.getElementById('miniMonth').innerHTML) throw new Error('mini month not painted');
		if (rail && !dom.window.document.getElementById('upcoming').innerHTML) throw new Error('up next not painted');
		good(f, `month ${counts.month} · week ${counts.week} · day ${counts.day} · list ${counts.list}`);
	} catch (e) {
		bad(f, e.message);
	}
	globalThis.window = undefined;
}

console.log('\n── 3. css token sanity ──');
{
	const css = readFileSync(join(here, 'proto.css'), 'utf8');
	const braces = (css.match(/\{/g) || []).length - (css.match(/\}/g) || []).length;
	if (braces) bad('proto.css', `${braces} unbalanced braces`);
	else {
		// every var(--x) must be defined in :root
		const defined = new Set([...css.matchAll(/^\s*--([a-z0-9-]+):/gim)].map((m) => m[1]));
		const used = new Set([...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((m) => m[1]));
		const undef = [...used].filter((u) => !defined.has(u));
		undef.length ? bad('proto.css', `undefined vars: ${undef.join(', ')}`) : good('proto.css', `${defined.size} tokens, all used vars defined`);
	}
}

console.log(problems ? `\n${problems} problems` : '\nclean');
process.exit(problems ? 1 : 0);
