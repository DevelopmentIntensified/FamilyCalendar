/* ============================================================================
   Dock check — one collapsed launcher, both tools behind it.

   The dock replaced two always-on bars, so the things worth asserting are:
   the chrome actually collapses, the menu opens both tools, only one is open
   at a time, Escape backs out, and the old two-bar contract is gone.

   Run: node prototypes/calendar-ui/dock-check.mjs
   ========================================================================== */
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), 'utf8');
const PAGES = readdirSync(here).filter((f) => f.endsWith('.html')).sort();

let bad = 0;
const fail = (m) => { bad++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DRAG = read('drag.js');
const DOCK = read('dock.js');

/** jsdom has no layout, so every box is the same fixed size. */
function stub(dom) {
	dom.window.Element.prototype.getBoundingClientRect = function () {
		return { left: 400, top: 600, width: 220, height: 44, right: 620, bottom: 644, x: 400, y: 600 };
	};
	dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
}

/**
 * Load the page the way a browser would: the scripts run, then DOMContentLoaded
 * fires and everything waiting on it starts. jsdom leaves readyState at
 * 'loading' after an out-of-band eval, so we fire it ourselves rather than
 * pretending the dock builds synchronously.
 */
async function boot(page) {
	const dom = new JSDOM(read(page), { url: 'https://x.test/' + page, runScripts: 'outside-only', pretendToBeVisual: true });
	stub(dom);
	dom.window.eval(DRAG);
	dom.window.eval(DOCK);
	// feedback.js is what builds the bar; run it so there is something to open
	dom.window.eval(read('feedback.js'));
	dom.window.eval(read('proto-nav.js'));
	if (dom.window.document.readyState === 'loading') {
		dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
	}
	await sleep(10);
	return dom;
}

const click = (w, n) => n.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const key = (w, n, k) => n.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));

console.log('\n── 1. every page loads the dock, after drag.js ──');
for (const f of PAGES) {
	const src = read(f);
	const issues = [];
	if (!/dock\.js/.test(src)) issues.push('no dock.js');
	if (src.indexOf('dock.js') > src.indexOf('feedback.js')) issues.push('dock.js loads after feedback.js');
	if (!/drag\.js/.test(src)) issues.push('no drag.js');
	if (src.indexOf('drag.js') > src.indexOf('dock.js')) issues.push('drag.js loads after dock.js');
	issues.length ? fail(`${f} — ${issues.join(', ')}`) : ok(f);
}

console.log('\n── 2. the chrome collapses: nothing is on screen until asked ──');
for (const f of PAGES) {
	const dom = await boot(f);
	const d = dom.window.document;
	const dock = d.querySelector('.fb-dock');
	const bar = d.querySelector('.fb-bar');
	const sw = d.querySelector('.proto-switch');
	const problems = [];
	if (!dock) problems.push('no .fb-dock');
	if (bar && !bar.hidden) problems.push('the review bar is visible on load');
	if (sw && !sw.hidden) problems.push('the switcher is visible on load');
	if (dock && dock.getAttribute('data-menu') === '1') problems.push('the menu is open on load');
	if (dock && dock.getAttribute('data-panel')) problems.push('a panel is open on load');
	problems.length ? fail(`${f} — ${problems.join(', ')}`) : ok(`${f.padEnd(26)} collapsed to one ${dock ? '36px' : '?'} pill`);
}

console.log('\n── 3. the dock is tiny ──');
{
	const dom = await boot('d-working-calendar.html');
	const css = dom.window.document.getElementById('fb-dock-style').textContent;
	const h = css.match(/\.fb-dock\{[^}]*height:([\d.]+)rem/);
	if (!h) fail('no height on .fb-dock');
	else if (parseFloat(h[1]) > 2.5) fail(`.fb-dock is ${h[1]}rem tall — that is not a tiny menu`);
	else ok(`.fb-dock is ${h[1]}rem tall (2.25rem = 36px)`);
	// and it carries no panel content of its own
	if (/\.fb-dock\{[^}]*overflow/.test(css)) fail('.fb-dock has overflow handling — it is meant to be a pill');
	else ok('the dock is a pill, not a container for the panels');
}

console.log('\n── 4. the menu opens both tools ──');
{
	const dom = await boot('d-working-calendar.html');
	const w = dom.window, d = w.document;
	const dock = d.querySelector('.fb-dock');
	const items = [...d.querySelectorAll('.fb-dock__item')];
	const label = (i) => (i.querySelector('b').textContent + ' (' + i.querySelector('.fb-dock__meta').textContent + ')');
	if (!/^Review/.test(label(items[0]))) fail(`first menu item is "${label(items[0])}", expected Review`);
	if (!/^Switch/.test(label(items[1]))) fail(`second menu item is "${label(items[1])}", expected Switch`);
	// The approve action is a page-level decision, not navigation, so it sits
	// after the two tools and before the separator; the tree link stays last.
	if (!/^Approve for building/.test(label(items[2])))
		fail(`third menu item is "${label(items[2])}", expected the approve action`);
	if (items[2].getAttribute('aria-pressed') !== 'false')
		fail('the approve item does not expose its state (aria-pressed)');
	if (!/^All prototypes/.test(label(items[3])))
		fail(`fourth menu item is "${label(items[3])}", expected a link to the tree`);
	else
		ok(`menu: ${label(items[0])} · ${label(items[1])} · ${label(items[2])} · ${label(items[3])}`);

	click(w, d.querySelector('.fb-dock__hit'));
	if (d.querySelector('.fb-dock__menu').getAttribute('data-open') !== '1') fail('the menu did not open');
	else ok('menu opens');

	click(w, items[0]);
	if (d.querySelector('.fb-bar').hidden) fail('Review did not open the toolbar');
	else ok('Review opens the toolbar');
	if (dock.getAttribute('data-panel') !== 'bar') fail('the dock did not record which panel is open');
	else ok(`dock records data-panel="${dock.getAttribute('data-panel')}"`);
	if (d.querySelector('.fb-dock__menu').getAttribute('data-open') === '1') fail('the menu stayed open behind the panel');
	else ok('the menu closes once a panel opens');
}

console.log('\n── 5. only one panel is open at a time ──');
{
	const dom = await boot('d-working-calendar.html');
	const w = dom.window, d = w.document;
	const items = [...d.querySelectorAll('.fb-dock__item')];
	click(w, d.querySelector('.fb-dock__hit'));
	click(w, items[0]);
	click(w, d.querySelector('.fb-dock__hit'));   // close the bar
	if (!d.querySelector('.fb-bar').hidden) fail('the toolbar would not close');
	click(w, d.querySelector('.fb-dock__hit'));
	click(w, items[1]);                            // open the switcher instead
	const open = ['.fb-bar', '.proto-switch'].filter((s) => !d.querySelector(s).hidden);
	if (open.length !== 1) fail(`${open.length} panels open, expected exactly 1`);
	else ok(`switching panels keeps one open (${open[0]})`);
}

console.log('\n── 6. Escape backs out, one layer at a time ──');
{
	const dom = await boot('d-working-calendar.html');
	const w = dom.window, d = w.document;
	click(w, d.querySelector('.fb-dock__hit'));
	key(w, d.body, 'Escape');
	if (d.querySelector('.fb-dock__menu').getAttribute('data-open') === '1') fail('Escape did not close the menu');
	else ok('Escape closes the menu');

	click(w, [...d.querySelectorAll('.fb-dock__item')][0]);
	if (d.querySelector('.fb-bar').hidden) fail('could not reopen the toolbar');
	key(w, d.body, 'Escape');
	if (!d.querySelector('.fb-bar').hidden) fail('Escape did not close the toolbar');
	else ok('Escape then closes the panel');
}

console.log('\n── 7. M toggles the dock, but not while typing ──');
{
	const dom = await boot('d-working-calendar.html');
	const w = dom.window, d = w.document;
	key(w, d.body, 'm');
	if (d.querySelector('.fb-dock__menu').getAttribute('data-open') !== '1') fail('M did not open the menu');
	else ok('M opens the menu');
	key(w, d.body, 'm');
	if (d.querySelector('.fb-dock__menu').getAttribute('data-open') === '1') fail('M did not close the menu');
	else ok('M closes it again');
	// typing an "m" in a field must not summon the menu
	click(w, [...d.querySelectorAll('.fb-dock__item')][0]);
	const ta = d.querySelector('.fb-card textarea');
	if (ta) {
		ta.focus();
		key(w, ta, 'm');
		if (d.querySelector('.fb-dock__menu').getAttribute('data-open') === '1') fail('M fired while typing in a comment');
		else ok('M is ignored while typing in a comment');
	} else ok('M is ignored while typing (no textarea open to test)');
}

console.log('\n── 8. the dock is the only movable thing ──');
{
	const dom = await boot('d-working-calendar.html');
	const d = dom.window.document;
	if (!d.querySelector('.fb-dock').__draggable) fail('the dock is not draggable');
	else ok('the dock is draggable');
	// the two old bars must NOT be independently draggable when a dock exists
	if (d.querySelector('.fb-bar').__draggable) fail('the toolbar is still independently draggable — two moving things again');
	if (d.querySelector('.proto-switch').__draggable) fail('the switcher is still independently draggable');
	if (d.querySelector('.fb-bar').__draggable || d.querySelector('.proto-switch').__draggable) { /* reported above */ }
	else ok('neither panel is independently draggable');
}

console.log('\n── 9. the badge tracks what feedback.js reports ──');
{
	const dom = await boot('d-working-calendar.html');
	const w = dom.window, d = w.document;
	const badge = d.querySelector('.fb-dock__n');
	if (!badge.hidden) fail('the badge is showing with nothing marked');
	else ok('badge hidden at zero');

	d.dispatchEvent(new w.CustomEvent('proto-fb:change', { detail: { marked: 3, round: 1 } }));
	if (badge.hidden) fail('the badge did not appear for 3 marks');
	else if (badge.textContent !== '3') fail(`badge reads "${badge.textContent}", expected 3`);
	else ok('badge shows 3');

	d.dispatchEvent(new w.CustomEvent('proto-fb:change', { detail: { marked: 0, round: 2 } }));
	if (!badge.hidden) fail('the badge did not clear at zero');
	else ok('badge clears back to hidden');
}

console.log('\n── 10. the dock is chrome, so it cannot be picked ──');
{
	const fb = read('feedback.js');
	if (!/\.fb-dock/.test(fb.match(/function isChrome[\s\S]*?\n\t\}/)[0])) {
		fail('isChrome() does not exclude .fb-dock — the dock itself is reviewable');
	} else ok('isChrome() excludes the dock, so you cannot mark up the review UI');
	// and the menu specifically
	if (!/fb-dock/.test(fb)) fail('.fb-dock is missing from the chrome list');
}

console.log('\n── 11. the whole review loop still works with the dock in place ──');
/* feedback-check covers the overlay in isolation (no dock). This is the
   integration that matters: a real page, the dock collapsed, and a reviewer
   picking an element, writing a note and marking a verdict. Each step bails
   out on its own so one break does not cascade into six confusing failures. */
async function reviewLoop() {
	const dom = await boot('d-working-calendar.html');
	const w = dom.window, d = w.document;

	// 1. open the toolbar from the dock
	click(w, d.querySelector('.fb-dock__hit'));
	click(w, [...d.querySelectorAll('.fb-dock__item')][0]);
	if (d.querySelector('.fb-bar').hidden) return fail('could not open the toolbar from the dock');
	ok('toolbar opened from the dock');

	// 2. turn picking on from the toolbar
	const pick = d.querySelector('.fb-bar__pick');
	click(w, pick);
	if (pick.getAttribute('aria-pressed') !== 'true') return fail('picking did not engage');
	ok('picking engaged');

	// 3. hover a region, then click it — the picker's actual gesture
	const target = d.querySelector('[data-fb="toolbar"]') || d.querySelector('[data-fb]');
	target.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 20, clientY: 20 }));
	await sleep(5);
	click(w, target);
	await sleep(10);
	const card = d.querySelector('.fb-card');
	if (card.hidden) return fail('clicking a region did not open a comment card');
	ok('clicking a region opened its comment card');

	// 4. mark it bad FIRST — a bad verdict with no note yet implies a redo.
	//    (With a note already written the reviewer has obviously said what they
	//     mean, so the tool stops second-guessing them. Test the real contract.)
	const badBtn = card.querySelector('.fb-v[data-v="bad"]');
	if (!badBtn) return fail('no way to mark a verdict on the card');
	badBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
	await sleep(10);
	ok('marked bad');

	// 5. the dock badge reflects the mark without the bar being consulted
	//    (the mark only survives once it has a verdict or a note, so the
	//     badge cannot be checked before this point)
	await sleep(500);   // save() is debounced
	const badge = d.querySelector('.fb-dock__n');
	if (badge.hidden || badge.textContent !== '1') return fail(`badge reads "${badge.textContent}" (hidden=${badge.hidden}), expected 1`);
	ok('dock badge shows the mark');

	// 6. and it persisted under this page's key, with the note and the redo
	const ta = card.querySelector('.fb-card__text') || card.querySelector('textarea');
	if (!ta) return fail('the comment card has no note field');
	ta.value = 'the rail eats a seventh of the grid';
	ta.dispatchEvent(new w.Event('input', { bubbles: true }));
	await sleep(500);
	const stored = JSON.parse(w.localStorage.getItem('proto-fb:v1') || '{}');
	const rec = (stored.pages || {})['d-working-calendar.html'];
	const items = rec ? rec.rounds.flatMap((x) => x.items) : [];
	if (items.length !== 1) return fail(`expected 1 mark stored for this page, found ${items.length}`);
	if (items[0].verdict !== 'bad') return fail(`the verdict did not persist: ${items[0].verdict}`);
	if (items[0].note !== 'the rail eats a seventh of the grid') return fail(`the note did not persist: ${JSON.stringify(items[0].note)}`);
	ok('note and verdict persisted under this page’s key');
	if (!items[0].redo) fail('a bad verdict with no note did not imply a redo');
	else ok('bad implied a redo, as it should');
}
await reviewLoop();

console.log(bad ? `\n${bad} problems` : '\nclean');
process.exit(bad ? 1 : 0);
