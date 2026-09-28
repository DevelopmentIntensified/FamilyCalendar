/* End-to-end: boot a REAL prototype page with the rebuilt overlay, pick elements
   the way a user would, mark good/bad, and confirm the collector writes a file an
   agent can read. Run: node prototypes/calendar-ui/feedback-e2e.mjs           */
import { JSDOM } from 'jsdom';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL = 'C:/Users/MIRP/.agents/skills/prototype/assets/feedback';
// ONE collector, rooted at prototypes/ so the tree and both sets resolve. The
// feedback store is keyed on the PATH (see pageFile in feedback.js), so a page
// in this set is `calendar-ui/a.html`, not `a.html` — the collector then writes
// the file with the slashes flattened. Keeping the two in step here is the whole
// point: the suite asserts where the bytes actually land.
const ORIGIN = process.env.FB_ORIGIN || 'http://127.0.0.1:4180';
const SET = 'calendar-ui';
const OUT = join(here, '..', 'feedback');
/** the collector's filename for a page key — mirrors its stemFor() */
const stemFor = (p) => (String(p || 'page').replace(/\.html?$/i, '').replace(/[^a-z0-9._-]/gi, '_') || 'page').slice(0, 120);
const FB = readFileSync(join(SKILL, 'feedback.js'), 'utf8');

let bad = 0;
const fail = (m) => { bad++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (w, node, opts) => node.dispatchEvent(new w.MouseEvent('click', Object.assign({ bubbles: true, cancelable: true }, opts || {})));
const hover = (w, node) => node.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 20, clientY: 20 }));

console.log('\n── collector reachable ──');
try {
	const r = await fetch(ORIGIN + '/__feedback');
	if (!r.ok) throw new Error('HTTP ' + r.status);
	ok(`GET /__feedback → ${r.status}`);
} catch (e) {
	console.error(`collector not running at ${ORIGIN}: ${e.message}`);
	console.error('  node "...\\assets\\feedback\\collector.mjs" --root prototypes --port 4180');
	process.exit(2);
}

// KEY is how the store names the page (path-scoped, so the two sets' index.html
// never merge). FILE is the same page on disk, relative to this suite. They are
// not the same string, and conflating them is how you get a 404 from your own repo.
const KEY = `${SET}/a-warm-studio.html`;
const FILE = 'a-warm-studio.html';
rmSync(join(OUT, stemFor(KEY) + '.json'), { force: true });

const dom = new JSDOM(readFileSync(join(here, FILE), 'utf8'), {
	url: ORIGIN + '/' + KEY, runScripts: 'outside-only', pretendToBeVisual: true
});
dom.window.confirm = () => true;
dom.window.fetch = (u, o) => fetch(ORIGIN + u, o);
// jsdom has no layout; give real boxes so the picker has something to measure
let i = 0;
Array.prototype.forEach.call(dom.window.document.querySelectorAll('body *'), (n) => {
	i++;
	const x = 60 + (i % 6) * 150, y = 60 + Math.floor(i / 6) * 60;
	n.getBoundingClientRect = () => ({ left: x, top: y, width: 140, height: 44, right: x + 140, bottom: y + 44, x, y });
});
dom.window.eval(FB);
await sleep(30);

const w = dom.window, d = w.document, api = w.__protoFeedback;

console.log('\n── mark regions on the real page ──');
const regions = api.regions();
if (!regions.length) fail('no data-fb regions discovered on ' + FILE);
else ok(`${regions.length} regions available: ${regions.map((r) => r.label).join(' | ')}`);

click(w, d.querySelector('.fb-bar__pick'));
if (d.querySelector('.fb-bar__pick').getAttribute('aria-pressed') !== 'true') fail('picking did not engage');
else ok('picking engaged');

// hover a chip first, the way a user scouts before clicking
// the month view and legend are rendered by proto-shell.js at runtime, which this
// harness does not execute — hover something that exists in the static HTML
const verse = d.querySelector('[data-fb="verse"]');
if (verse) {
	hover(w, verse);
	const tag = d.querySelector('.fb-hover__tag');
	if (!tag || !tag.textContent.trim()) fail('hover produced no element label');
	else ok(`hover label: ${tag.textContent.trim()}`);
} else fail('no element to hover on ' + FILE);

// bad: the toolbar's view toggle
const seg = d.querySelector('[data-fb="toolbar"] .seg') || d.querySelector('.seg');
click(w, seg);
let card = d.querySelector('.fb-card');
if (card.hidden) fail('no card after selecting the view toggle');
click(w, card.querySelector('.fb-v[data-v="bad"]'));
let ta = d.querySelector('.fb-card__text');
ta.value = 'Four equal-weight clusters in one row. Collapse to one pill plus one overflow menu.';
ta.dispatchEvent(new w.Event('input', { bubbles: true }));
const first = api.items()[0];
if (first.verdict !== 'bad') fail(`verdict not applied: ${first.verdict}`);
else ok(`bad → <${first.tag}> ${first.selector}`);
if (!first.redo) fail('bad did not land on the redo list');
else ok('bad defaulted onto the redo list');

// good: the verse / quick-capture strip
const notes = d.querySelector('[data-fb="notes"]');
if (notes) {
	click(w, notes, { shiftKey: true });
	card = d.querySelector('.fb-card');
	click(w, card.querySelector('.fb-v[data-v="good"]'));
	ta = d.querySelector('.fb-card__text');
	ta.value = 'Keep the three-column what-this-keeps / fixes / cost breakdown.';
	ta.dispatchEvent(new w.Event('input', { bubbles: true }));
	const second = api.items()[1];
	if (second.verdict !== 'good') fail(`good verdict not applied: ${second.verdict}`);
	else if (second.redo) fail('good should not be flagged for redo');
	else ok(`good → <${second.tag}> in "${second.regionLabel}", not flagged for redo`);
} else fail('nothing to mark good');

console.log('\n── force a save and wait for the collector ──');
await api.push();
await sleep(250);

console.log('\n── the file an agent would read ──');
const file = join(OUT, stemFor(KEY) + '.json');
if (!existsSync(file)) {
	fail('no feedback file written at ' + file);
} else {
	const rec = JSON.parse(readFileSync(file, 'utf8'));
	if (rec.page !== KEY) fail(`wrong page recorded: ${rec.page}, expected ${KEY}`);
	if (rec.items.length !== api.items().length) fail(`file has ${rec.items.length} items, page has ${api.items().length}`);
	else if (!rec.viewport) fail('no viewport recorded');
	else if (!rec.about || !rec.about.label) fail(`the file does not say which prototype this is: ${JSON.stringify(rec.about)}`);
	else if (!rec.about.question) fail('the file has no question');
	else if (!rec.updatedAt) fail('no updatedAt');
	else {
		ok(`identity on disk: "${rec.about.label}" — ${rec.about.question.slice(0, 46)}…`);
		ok(`file written: ${rec.page} @ ${rec.viewport}`);
		rec.items.forEach((it, n) => {
			ok(`  ${n + 1}. <${it.tag}> [${it.verdict || 'unmarked'}]${it.redo ? ' REDO' : ''}${it.regionLabel ? ' in ' + it.regionLabel : ''}`);
			ok(`     ${it.selector}`);
			if (it.box) ok(`     ${it.box.w}×${it.box.h}px · ${Object.keys(it.styles || {}).length} computed styles · ${(it.html || '').length}b html`);
			if (it.note) ok(`     note: ${it.note}`);
		});
		const bad_ = rec.items.filter((i) => i.verdict === 'bad');
		const redo = rec.items.filter((i) => i.redo);
		if (!bad_.length) fail('the bad mark did not survive the round trip');
		if (redo.length !== bad_.length) fail(`redo list out of sync: ${redo.length} redo vs ${bad_.length} bad`);
		else ok('redo list survived the round trip');
	}
}

/* the markdown the agent would read instead */
console.log('\n── markdown rollup ──');
const md = api.markdown(false);
if (!/Bad — rebuild these/.test(md)) fail('markdown has no bad group');
if (!/Good — keep these/.test(md)) fail('markdown has no good group');
if (!/REBUILD THIS/.test(md)) fail('markdown lost the rebuild marker');
else ok('markdown groups bad/good/ideas and flags the redo');
console.log('\n' + md.split('\n').slice(0, 14).map((l) => '    ' + l).join('\n'));

/* a second page, sharing the same browser storage, must see the first page's marks */
console.log('\n── marks carry across prototypes ──');
{
	const cKey = `${SET}/c-day-first.html`;
	const cFile = 'c-day-first.html';
	const dom2 = new JSDOM(readFileSync(join(here, cFile), 'utf8'), {
		url: ORIGIN + '/' + cKey, runScripts: 'outside-only', pretendToBeVisual: true
	});
	dom2.window.confirm = () => true;
	dom2.window.fetch = (u, o) => fetch(ORIGIN + u, o);
	// hand over the store the first page wrote, as a real reload would
	dom2.window.localStorage.setItem('proto-fb:v1', w.localStorage.getItem('proto-fb:v1'));
	let j = 0;
	Array.prototype.forEach.call(dom2.window.document.querySelectorAll('body *'), (n) => {
		j++;
		const x = 60 + (j % 6) * 150, y = 60 + Math.floor(j / 6) * 60;
		n.getBoundingClientRect = () => ({ left: x, top: y, width: 140, height: 44, right: x + 140, bottom: y + 44, x, y });
	});
	dom2.window.eval(FB);
	await sleep(30);

	const api2 = dom2.window.__protoFeedback;
	if (api2.items().length !== 0) fail('page C inherited marks from page A');
	else ok('page C starts clean — marks are per page, not shared');

	const st = api2.store();
	if (st.length !== 1 || st[0].page !== KEY) {
		fail(`store does not know about the other page: ${JSON.stringify(st.map((x) => x.page))}`);
		process.exit(1);
	}
	ok(`store sees the other prototype: ${st[0].page} (${st[0].count} marks) — "${st[0].about.label}"`);

	const all = api2.markdown(false, 'all');
	if (!new RegExp(st[0].about.label.replace(/[.*+?^$()|[\\]{}]/g, '\\$&')).test(all)) fail('cross-page copy lost the other prototype');
	if (!/Question:/.test(all)) fail('cross-page copy has no question context');
	else ok('copy from page C includes page A’s review, with its question');

	const here2 = api2.markdown(false, 'page');
	if (new RegExp(st[0].about.label.replace(/[.*+?^$()|[\\]{}]/g, '\\$&')).test(here2)) fail('page scope leaked another prototype');
	else ok('page-scoped copy stays on this page');
}

console.log(bad ? `\n${bad} problems` : '\nclean');
process.exit(bad ? 1 : 0);
