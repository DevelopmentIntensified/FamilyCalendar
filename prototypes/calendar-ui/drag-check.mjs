/* Exercises drag.js: threshold, persistence, clamping, reset, and that a drag
   never swallows a click the user meant.
   Run: node prototypes/calendar-ui/drag-check.mjs                                */
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL = 'C:/Users/MIRP/.agents/skills/prototype/assets/feedback';
const DRAG = readFileSync(join(SKILL, 'drag.js'), 'utf8');

let bad = 0;
const fail = (m) => { bad++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);

const PAGE = `<!doctype html><html><body><main><p>page</p></main>
<nav class="proto-switch"><span class="proto-switch__label">View</span><a class="proto-switch__btn" href="a.html">A</a></nav>
</body></html>`;

function boot() {
	const dom = new JSDOM(PAGE, { url: 'https://x.test/a.html', runScripts: 'outside-only', pretendToBeVisual: true });
	// A real layout: the bar starts bottom-left. The stub reflects the element's
	// own style once it has been moved, so the code can read back where it went.
	const bar = dom.window.document.querySelector('.proto-switch');
	layout(bar, { left: 16, top: 820, width: 200, height: 40 });
	Object.defineProperty(dom.window, 'innerWidth', { value: 1000, configurable: true });
	Object.defineProperty(dom.window, 'innerHeight', { value: 860, configurable: true });
	dom.window.eval(DRAG);
	dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
	return { dom, bar };
}

/** make a stubbed rect follow the element's own positioning */
function layout(bar, box) {
	bar.getBoundingClientRect = () => {
		const l = bar.style.left !== '' ? parseFloat(bar.style.left) : box.left;
		const t = bar.style.top !== '' ? parseFloat(bar.style.top) : box.top;
		return { left: l, top: t, width: box.width, height: box.height, right: l + box.width, bottom: t + box.height, x: l, y: t };
	};
}

/** jsdom has no PointerEvent; build one and dispatch it on the real target so
    `e.target` is set the way the browser would. */
function pointer(w, type, x, y, target) {
	const ev = new w.Event(type, { bubbles: true, cancelable: true });
	ev.pointerId = 1;
	ev.clientX = x;
	ev.clientY = y;
	ev.button = 0;
	ev.isPrimary = true;
	target.dispatchEvent(ev);
	return ev;
}

console.log('\n── 1. mount and hint ──');
{
	const { dom, bar } = boot();
	const w = dom.window;
	if (!w.__protoDrag) fail('drag.js did not expose __protoDrag');
	if (!bar.__draggable) fail('bar not made draggable');
	if (!/Drag to move/.test(bar.getAttribute('title') || '')) fail('no drag hint on the title attribute');
	else ok(`mounted; title hint: "${bar.getAttribute('title')}"`);
	bar.setPointerCapture = () => {};
	bar.releasePointerCapture = () => {};
}

console.log('\n── 2. a click is not a drag ──');
{
	const { dom, bar } = boot();
	const w = dom.window;
	bar.setPointerCapture = () => {};
	bar.releasePointerCapture = () => {};
	// a 2px wobble must not count
	pointer(w, 'pointerdown', 100, 830, bar);
	pointer(w, 'pointermove', 102, 831, bar);
	pointer(w, 'pointerup', 102, 831, bar);
	if (bar.dataset.dragged === '1') fail('a 2px wobble was treated as a drag');
	if (dom.window.localStorage.getItem('proto-pos:switcher')) fail('a click persisted a position');
	else ok('sub-threshold movement is a click, not a drag');
}

console.log('\n── 3. drag past the threshold moves and persists ──');
{
	const { dom, bar } = boot();
	const w = dom.window;
	bar.setPointerCapture = () => {};
	bar.releasePointerCapture = () => {};
	pointer(w, 'pointerdown', 100, 830, bar);
	pointer(w, 'pointermove', 300, 500, bar);
	if (bar.style.transform !== 'none') fail('transform-centring was not released on first drag');
	else ok('converted from transform-centred to explicit left/top');
	pointer(w, 'pointerup', 300, 500, bar);

	// grab offset: pointer was 84px into the bar (100 - 16), so new left = 300-84
	const stored = JSON.parse(dom.window.localStorage.getItem('proto-pos:switcher') || 'null');
	if (!stored) fail('position was not persisted');
	else if (Math.abs(stored.x - 216) > 2) fail(`wrong x: ${stored.x}, expected ~216 (kept the grab point)`);
	else if (Math.abs(stored.y - 490) > 2) fail('wrong y: ' + stored.y + ', expected 490 (pointer 500 minus the 10px grab offset)');
	else ok(`persisted to { x: ${stored.x}, y: ${stored.y} } — the bar keeps its grab point`);
}

console.log('\n── 4. restored on the next page load ──');
{
	// first visit
	{
		const { dom, bar } = boot();
		bar.setPointerCapture = () => {};
		bar.releasePointerCapture = () => {};
		pointer(dom.window, 'pointerdown', 100, 830, bar);
		pointer(dom.window, 'pointermove', 400, 300, bar);
		pointer(dom.window, 'pointerup', 400, 300, bar);
	}
	// second visit, sharing storage
	const dom = new JSDOM(PAGE, { url: 'https://x.test/b.html', runScripts: 'outside-only', pretendToBeVisual: true });
	const bar = dom.window.document.querySelector('.proto-switch');
	layout(bar, { left: 0, top: 0, width: 200, height: 40 });
	Object.defineProperty(dom.window, 'innerWidth', { value: 1000, configurable: true });
	Object.defineProperty(dom.window, 'innerHeight', { value: 860, configurable: true });
	dom.window.localStorage.setItem('proto-pos:switcher', JSON.stringify({ x: 400, y: 300 }));
	dom.window.eval(DRAG);
	dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
	if (bar.style.left !== '400px' || bar.style.top !== '300px') {
		fail(`position not restored: left=${bar.style.left} top=${bar.style.top}`);
	} else ok('position restored on the next page load');
}

console.log('\n── 5. clamped to the viewport ──');
{
	const dom = new JSDOM(PAGE, { url: 'https://x.test/a.html', runScripts: 'outside-only', pretendToBeVisual: true });
	const bar = dom.window.document.querySelector('.proto-switch');
	layout(bar, { left: 0, top: 0, width: 200, height: 40 });
	Object.defineProperty(dom.window, 'innerWidth', { value: 400, configurable: true });
	Object.defineProperty(dom.window, 'innerHeight', { value: 300, configurable: true });
	bar.setPointerCapture = () => {};
	bar.releasePointerCapture = () => {};
	dom.window.eval(DRAG);
	dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
	pointer(dom.window, 'pointerdown', 50, 20, bar);
	pointer(dom.window, 'pointermove', 9999, 9999, bar);
	pointer(dom.window, 'pointerup', 9999, 9999, bar);
	const x = parseInt(bar.style.left, 10);
	const y = parseInt(bar.style.top, 10);
	if (x > 400 - 200 - 4) fail(`not clamped horizontally: left=${x}`);
	else if (y > 300 - 40 - 4) fail(`not clamped vertically: top=${y}`);
	else if (x < 0 || y < 0) fail('clamped to a negative coordinate');
	else ok(`clamped to ${x},${y} inside a 400×300 viewport`);
}

console.log('\n── 6. double-click resets ──');
{
	const { dom, bar } = boot();
	const w = dom.window;
	bar.setPointerCapture = () => {};
	bar.releasePointerCapture = () => {};
	pointer(w, 'pointerdown', 100, 830, bar);
	pointer(w, 'pointermove', 400, 300, bar);
	pointer(w, 'pointerup', 400, 300, bar);
	if (!dom.window.localStorage.getItem('proto-pos:switcher')) fail('setup: nothing was stored');

	bar.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
	if (dom.window.localStorage.getItem('proto-pos:switcher')) fail('double-click did not forget the position');
	if (bar.style.left !== '' || bar.style.top !== '') fail(`reset did not restore the original styles: left=${bar.style.left} top=${bar.style.top}`);
	else if (bar.style.transform !== '') fail('reset left an inline transform behind: ' + bar.style.transform);
	else ok('double-click clears the position and restores the centring');
}

console.log('\n── 7. buttons still clickable, drag does not steal them ──');
{
	const { dom, bar } = boot();
	const w = dom.window;
	bar.setPointerCapture = () => {};
	bar.releasePointerCapture = () => {};
	const btn = dom.window.document.querySelector('.proto-switch__btn');
	let clicked = 0;
	btn.addEventListener('click', () => { clicked++; });

	// pressing ON a button must not start a drag…
	pointer(w, 'pointerdown', 50, 830, btn);
	pointer(w, 'pointermove', 300, 500, btn);
	pointer(w, 'pointerup', 300, 500, btn);
	if (bar.dataset.dragged === '1') fail('pressing on a button started a drag');
	else ok('pressing on a button does not start a drag');

	// …and the button's own click still fires
	btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
	if (clicked !== 1) fail(`button click was swallowed: ${clicked}`);
	else ok('button clicks still work');
}

// Derive the page list from the directory. A hardcoded list breaks the moment a
// prototype is added, and the failure looks like a product bug.
const PAGES = readdirSync(here)
	.filter((f) => f.endsWith('.html'))
	.sort();

console.log(`\n── 8. wired into all ${PAGES.length} pages ──`);
{
	for (const f of PAGES) {
		const src = readFileSync(join(here, f), 'utf8');
		if (!/drag\.js/.test(src)) fail(`${f} does not load drag.js`);
		else if (!/proto-nav\.js/.test(src)) fail(`${f} does not load proto-nav.js`);
	}
	ok(`all ${PAGES.length} pages load drag.js`);
	// load order matters: drag.js must define __protoDrag before the consumers
	for (const f of PAGES) {
		const src = readFileSync(join(here, f), 'utf8');
		if (src.indexOf('drag.js') > src.indexOf('proto-nav.js')) fail(`${f} loads drag.js after proto-nav.js`);
	}
	ok('drag.js is loaded before its consumers');

	// drag.js auto-attaches, so the bars move without any consumer opting in
	const { dom, bar } = boot();
	if (!bar.__draggable) fail('drag.js did not auto-attach to the switcher');
	else ok('drag.js auto-attaches — no opt-in needed from the consumer');
	// and the explicit API is still available for a custom bar
	const custom = dom.window.document.createElement('div');
	custom.className = 'fb-bar';
	dom.window.document.body.appendChild(custom);
	dom.window.__protoDrag(custom, 'custom');
	if (!custom.__draggable) fail('the explicit API does not work on a custom bar');
	else ok('the explicit API still works for custom chrome');
}

console.log(bad ? `\n${bad} problems` : '\nclean');
process.exit(bad ? 1 : 0);
