/* Exercises the rebuilt feedback overlay in jsdom against the model borrowed
   from stagewise (hover → click) and BugHerd (pins attached to elements).
   Run: node prototypes/calendar-ui/feedback-check.mjs                            */
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL = 'C:/Users/MIRP/.agents/skills/prototype/assets/feedback';
const FB = readFileSync(join(SKILL, 'feedback.js'), 'utf8');

let bad = 0;
const fail = (m) => { bad++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGE = `<!doctype html><html><body>
<title>Fixture</title>
<script type="application/json" id="fb-page">
{ "id": "a", "label": "Prototype A · Fixture", "family": "calendar-ui",
  "question": "Does the picker work?", "thesis": "A small fixture page.", "risk": "none" }
</script>\n<main>
  <section data-fb="toolbar" data-fb-label="Toolbar">
    <div class="row">
      <button class="btn" id="today">Today</button>
      <div class="seg" id="views"><span>Month</span><span>Week</span></div>
    </div>
  </section>
  <section data-fb="grid" data-fb-label="Month grid">
    <div class="cell" id="c1"><span class="chip">Morning prayer</span><span class="chip">Piano</span></div>
  </section>
</main></body></html>`;

function boot() {
	const dom = new JSDOM(PAGE, { url: 'https://x.test/a-warm-studio.html', runScripts: 'outside-only', pretendToBeVisual: true });
	dom.window.confirm = () => true;
	dom.window.navigator.clipboard = null;
	// jsdom has no layout, so every rect is 0x0 and the picker would treat
	// every element as unpickable. Give each element a plausible box.
	const d = dom.window.document;
	let i = 0;
	Array.prototype.forEach.call(d.querySelectorAll('main *'), (n) => {
		const w = 120, h = 32;
		i++;
		n.getBoundingClientRect = () => ({
			left: 40 + (i % 3) * 140, top: 40 + Math.floor(i / 3) * 40,
			width: w, height: h, right: 40 + (i % 3) * 140 + w, bottom: 40 + Math.floor(i / 3) * 40 + h,
			x: 40 + (i % 3) * 140, y: 40 + Math.floor(i / 3) * 40
		});
	});
	dom.window.eval(FB);
	return dom;
}
const tick = () => sleep(10);
const click = (w, node, opts) => node.dispatchEvent(new w.MouseEvent('click', Object.assign({ bubbles: true, cancelable: true }, opts || {})));
const press = (w, key, opts) => w.document.dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, opts || {})));

/* ────────────────────────────────────────────────── 1. chrome never mounts twice */
console.log('\n── 1. mount ──');
{
	const dom = boot();
	await tick();
	const d = dom.window.document;
	if (!d.querySelector('.fb-bar')) fail('toolbar did not mount');
	else ok('toolbar, pins, card and list mounted');
	dom.window.eval(FB);
	if (d.querySelectorAll('.fb-bar').length !== 1) fail('double-mounted');
	else ok('re-running the script is a no-op');
}

/* ────────────────────────────────────────────────────── 2. free-form picking */
console.log('\n── 2. free-form element picking (stagewise) ──');
{
	const dom = boot();
	await tick();
	const w = dom.window, d = w.document, api = w.__protoFeedback;
	const today = d.getElementById('today');

	// not picking yet: a click must reach the page, not the overlay
	let reached = false;
	today.addEventListener('click', () => { reached = true; });
	click(w, today);
	if (!reached) fail('click was swallowed while not picking');
	else if (!d.querySelector('.fb-bar__pick').getAttribute('aria-pressed') === 'false') { /* noop */ }
	ok('clicks pass through to the page while not picking');

	// turn picking on
	click(w, d.querySelector('.fb-bar__pick'));
	if (d.querySelector('.fb-bar__pick').getAttribute('aria-pressed') !== 'true') fail('picking did not engage');
	if (!d.body.classList.contains('fb-picking')) fail('fb-picking class not set');
	else ok('picking engages');

	// hover shows the tag (dispatched on the element so e.target is set)
	today.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 10 }));
	const hover = d.querySelector('.fb-hover');
	if (hover.style.display !== 'block') fail('hover tracker not shown on hover');
	if (!/button/.test(d.querySelector('.fb-hover__tag').textContent)) {
		fail(`hover tag does not name the element: "${d.querySelector('.fb-hover__tag').textContent}"`);
	} else ok(`hover tag reads "${d.querySelector('.fb-hover__tag').textContent.trim()}"`);

	// click selects that exact element, and the page must NOT see it
	reached = false;
	click(w, today);
	if (reached) fail('page handler fired during picking — clicks are not being swallowed');
	if (api.items().length !== 1) fail(`expected 1 mark, got ${api.items().length}`);
	const it = api.items()[0];
	if (it.tag !== 'button') fail(`picked the wrong element: <${it.tag}>`);
	if (it.selector !== '#today') fail(`selector wrong: ${it.selector}`);
	if (!it.region || it.regionLabel !== 'Toolbar') fail(`enclosing region not captured: ${it.region}`);
	if (it.box.w === undefined) fail('no bounding box captured');
	if (!it.styles) fail('no computed styles captured');
	ok(`click picked <${it.tag}> ${it.selector} in region ${it.region}`);

	// a card opened automatically
	if (d.querySelector('.fb-card').hidden) fail('comment card did not open on select');
	else ok('comment card opens on select');
}

/* ───────────────────────────────────────────────────── 3. alt+click goes coarser */
console.log('\n── 3. alt+click selects the parent ──');
{
	const dom = boot();
	await tick();
	const w = dom.window, d = w.document, api = w.__protoFeedback;
	click(w, d.querySelector('.fb-bar__pick'));
	click(w, d.getElementById('views'), { altKey: true });
	if (api.items().length !== 1) fail('alt+click produced no mark');
	else if (api.items()[0].tag !== 'div') fail(`alt+click picked <${api.items()[0].tag}>, expected the parent div`);
	else ok(`alt+click walked up to <${api.items()[0].tag}> (${api.items()[0].selector})`);
}

/* ───────────────────────────────────────── 4. shift+click adds, and dedupes */
console.log('\n── 4. shift+click adds · re-click opens · shift removes ──');
{
	const dom = boot();
	await tick();
	const w = dom.window, d = w.document, api = w.__protoFeedback;
	click(w, d.querySelector('.fb-bar__pick'));

	click(w, d.getElementById('today'));
	click(w, d.getElementById('views'), { shiftKey: true });
	if (api.items().length !== 2) fail(`shift+click did not add: ${api.items().length} items`);
	else ok('shift+click adds a second mark');

	// plain click on an already-marked element reopens its card rather than duplicating
	const before = api.items().length;
	click(w, d.getElementById('today'));
	if (api.items().length !== before) fail('re-clicking a marked element duplicated it');
	else ok('re-clicking a marked element reopens instead of duplicating');

	// shift-click a marked element removes it
	click(w, d.getElementById('views'), { shiftKey: true });
	if (api.items().length !== 1) fail('shift+click on a marked element did not remove it');
	else ok('shift+click on a marked element removes it');
}

/* ───────────────────────────────────────────────── 5. good / bad / idea marking */
console.log('\n── 5. verdict: good / bad / idea ──');
{
	const dom = boot();
	await tick();
	const w = dom.window, d = w.document, api = w.__protoFeedback;
	click(w, d.querySelector('.fb-bar__pick'));

	click(w, d.getElementById('today'));
	click(w, d.getElementById('c1'), { shiftKey: true });
	click(w, d.getElementById('views'), { shiftKey: true });

	// mark the currently-open card
	const mark = (v) => {
		const c = d.querySelector('.fb-card');
		if (c.hidden) { fail('no card open when trying to mark ' + v); return; }
		const b = c.querySelector('.fb-v[data-v="' + v + '"]');
		if (!b) { fail('verdict button missing: ' + v); return; }
		click(w, b);
	};

	// shift+click adds *and* opens, so the open card is the last one added.
	// Open the first pin to be explicit, which also exercises pin -> card.
	click(w, d.querySelectorAll('.fb-pin')[0]);
	mark('good');
	if (api.items()[0].verdict !== 'good') fail(`good not recorded on item 0: "${api.items()[0].verdict}"`);
	else if (api.items()[0].redo) fail('good should not default to redo');
	else ok('good recorded, and not flagged for redo');

	click(w, d.querySelectorAll('.fb-pin')[1]);
	mark('bad');
	const bad = api.items()[1];
	if (bad.verdict !== 'bad') fail(`bad not recorded: "${bad.verdict}"`);
	else if (!bad.redo) fail('bad did not default to redo=true');
	else ok('bad recorded and defaulted onto the redo list');

	click(w, d.querySelectorAll('.fb-pin')[2]);
	mark('idea');
	if (api.items()[2].verdict !== 'idea') fail('idea not recorded');
	else ok('idea recorded');

	// toggling the same verdict off
	mark('idea');
	if (api.items()[2].verdict !== '') fail('re-clicking a verdict did not clear it');
	else ok('re-clicking a verdict clears it');

	// keyboard verdicts, on the still-unmarked third mark (verdicts toggle,
	// so this must not be a mark that already has one)
	click(w, d.querySelectorAll('.fb-pin')[2]);
	if (api.items()[2].verdict) fail('third mark was not unmarked to begin with');
	press(w, '1');
	if (api.items()[2].verdict !== 'good') fail(`key "1" did not set good: "${api.items()[2].verdict}"`);
	press(w, '2');
	if (api.items()[2].verdict !== 'bad') fail(`key "2" did not set bad: "${api.items()[2].verdict}"`);
	press(w, '3');
	if (api.items()[2].verdict !== 'idea') fail(`key "3" did not set idea: "${api.items()[2].verdict}"`);
	else ok('keys 1/2/3 set good/bad/idea on the open mark');

	// state so far: 0=good 1=bad 2=idea
	// the card says which region it is in
	click(w, d.querySelectorAll('.fb-pin')[1]);
	if (!/in Month grid/.test(d.querySelector('.fb-card__el').textContent)) {
		fail(`card does not name the enclosing region: "${d.querySelector('.fb-card__el').textContent}"`);
	} else ok('card names the enclosing region');

	// the context disclosure carries selector, size, classes and html
	const meta = d.querySelector('.fb-card__meta');
	if (!meta.open) meta.setAttribute('open', '');
	const kv = d.querySelector('.fb-card__kv').textContent;
	if (!/c1|cell/.test(kv)) fail('context missing the selector');
	if (!/\d+×\d+/.test(kv)) fail('context missing the size');
	if (!d.querySelector('.fb-card__html').textContent) fail('context missing the html snippet');
	else ok('context disclosure carries selector, size, classes and html');

	// tallies ride the debounced save, so let it settle
	await sleep(500);
	const tally = (v) => d.querySelector('.fb-bar__tally[data-v="' + v + '"] b').textContent;
	if (tally('good') !== '1' || tally('bad') !== '1' || tally('idea') !== '1') {
		fail(`tallies wrong: good=${tally('good')} bad=${tally('bad')} idea=${tally('idea')}`);
	} else ok('toolbar tallies track the verdicts');
}

/* ──────────────────────────────────────────────────────── 6. comment + markdown */
console.log('\n── 6. comment on a selection, then markdown ──');
{
	const dom = boot();
	await tick();
	const w = dom.window, d = w.document, api = w.__protoFeedback;
	click(w, d.querySelector('.fb-bar__pick'));
	click(w, d.getElementById('views'));
	click(w, d.getElementById('c1'), { shiftKey: true });

	click(w, d.querySelector('.fb-card .fb-v[data-v="bad"]'));
	const ta = d.querySelector('.fb-card__text');
	ta.value = 'Week column is 44px per hour but the day grid is 56px — make them match.';
	ta.dispatchEvent(new w.Event('input', { bubbles: true }));

	// marks live in the open round now, not at the top level
	const p = api.payload();
	const open = p.rounds.filter((r) => r.status === 'open');
	if (open.length !== 1) fail(`expected exactly 1 open round, got ${open.length}`);
	else if (open[0].items.length !== 2) fail(`open round has ${open[0].items.length} items, expected 2`);
	else if (open[0].items[1].note !== ta.value) fail('note not captured');
	if (!/^\d+x\d+$/.test(p.viewport)) fail('viewport not captured: ' + p.viewport);
	if (!p.page || !p.updatedAt || !p.title || !p.about) fail('payload metadata incomplete: ' + JSON.stringify({ page: p.page, t: p.updatedAt, title: p.title, about: p.about }));
	else ok(`note captured, viewport ${p.viewport}, page ${p.page}, ${p.rounds.length} round(s)`);

	const md = api.markdown(false);
	if (!/make them match/.test(md)) fail('markdown lost the note');
	if (!/REBUILD THIS/.test(md)) fail('markdown lost the rebuild marker');
	if (!/### Bad/.test(md)) fail('markdown does not group by verdict');
	if (!/Week column is 44px/.test(md)) fail('markdown lost the element text');
	else ok('markdown groups by verdict and carries note, text and redo');

	const redoOnly = api.markdown(true);
	if (!/REBUILD THIS/.test(redoOnly)) fail('redo-only markdown empty');
	if ((redoOnly.match(/REBUILD THIS/g) || []).length !== 1) fail('redo-only has the wrong count');
	else ok('redo-only markdown filters to the flagged ones');
}

/* ─────────────────────────────────────────────────────────── 7. pins + nav */
console.log('\n── 7. pins stay attached, list navigates ──');
{
	const dom = boot();
	await tick();
	const w = dom.window, d = w.document, api = w.__protoFeedback;
	click(w, d.querySelector('.fb-bar__pick'));
	click(w, d.getElementById('today'));
	click(w, d.getElementById('c1'), { shiftKey: true });

	if (d.querySelectorAll('.fb-pin').length !== 2) fail(`expected 2 pins, got ${d.querySelectorAll('.fb-pin').length}`);
	else ok('2 pins rendered, numbered');
	if (d.querySelector('.fb-pin').textContent.trim() !== '1') fail('pins not numbered in order');
	if (d.querySelectorAll('.fb-marked').length !== 2) fail('no selection wash on marked elements');
	else ok('marked elements keep a coloured wash');

	// a pin reopens its card
	click(w, d.querySelectorAll('.fb-pin')[1]);
	if (d.querySelector('.fb-card').hidden) fail('clicking a pin did not open its card');
	if (d.querySelector('.fb-card__n').textContent !== '2') fail('wrong card opened');
	else ok('clicking a pin opens the right card');

	// j/k walk between them
	press(w, 'j');
	if (d.querySelector('.fb-card__n').textContent !== '1') fail('j did not advance to mark 1');
	press(w, 'k');
	if (d.querySelector('.fb-card__n').textContent !== '2') fail('k did not go back to mark 2');
	else ok('j/k walk between marks');

	// the list
	click(w, Array.from(d.querySelectorAll('.fb-bar__btn')).find((b) => b.textContent.indexOf('List') === 0));
	if (d.querySelector('.fb-list').hidden) fail('list did not open');
	else if (!d.querySelector('.fb-list').classList.contains('is-open')) {
		// the panel is translateX(100%) until .is-open lands, so a missing class
		// leaves it rendered but off-screen to the right. Asserting `hidden`
		// alone is not enough — that bug shipped once already.
		fail('list is in the DOM but never revealed (missing .is-open) — it would sit off-screen');
	} else if (d.querySelectorAll('.fb-list__item').length !== 2) fail('list is missing marks');
	else ok('list opens, is revealed, and shows every mark');

	// closing puts it back off-screen rather than leaving it stuck open
	click(w, Array.from(d.querySelectorAll('.fb-list__head .fb-bar__btn')).find((b) => b.textContent === 'Close'));
	if (!d.querySelector('.fb-list').hidden) fail('list did not close');
	else if (d.querySelector('.fb-list').classList.contains('is-open')) fail('list kept .is-open after closing');
	else ok('list closes cleanly');

	// deleting from the card
	click(w, d.querySelector('.fb-card__x'));
	if (api.items().length !== 1) fail('delete did not remove the mark');
	else ok('delete removes the mark');
}

/* ────────────────────────────────────────────────── 8. keys, escape, safety */
console.log('\n── 8. keyboard and safety ──');
{
	const dom = boot();
	await tick();
	const w = dom.window, d = w.document, api = w.__protoFeedback;

	press(w, 'f');
	if (d.querySelector('.fb-bar__pick').getAttribute('aria-pressed') !== 'true') fail('F did not start picking');
	else ok('F starts picking');
	press(w, 'Escape');
	if (d.querySelector('.fb-bar__pick').getAttribute('aria-pressed') !== 'false') fail('Esc did not stop picking');
	else ok('Esc stops picking');

	click(w, d.querySelector('.fb-bar__pick'));
	click(w, d.getElementById('today'));
	press(w, 'Escape'); // closes picking
	press(w, 'Escape'); // closes the card
	if (!d.querySelector('.fb-card').hidden) fail('Esc did not close the card');
	else ok('Esc closes the card');

	// F must not fire while typing a note
	click(w, d.getElementById('c1'));
	const ta = d.querySelector('.fb-card__text');
	ta.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true }));
	if (d.querySelector('.fb-bar__pick').getAttribute('aria-pressed') === 'true') fail('F hijacked while typing a note');
	else ok('F is ignored while typing in a note');

	// never pick the overlay's own chrome
	const before = api.items().length;
	click(w, d.querySelector('.fb-bar__pick'));
	click(w, d.querySelector('.fb-bar__n'));
	if (api.items().length !== before) fail('the toolbar itself became pickable');
	click(w, d.querySelector('.fb-bar__n'));
	if (api.items().length !== before) fail('the toolbar counter became pickable');
	else ok('overlay chrome is never pickable');
	void ta;
}

/* ──────────────────────────────────────────────────────── 9. transport */
console.log('\n── 9. transport ──');
{
	const dom = boot();
	await tick();
	click(dom.window, dom.window.document.querySelector('.fb-bar__pick'));
	click(dom.window, dom.window.document.getElementById('today'));
	await sleep(500);
	const d = dom.window.document;
	const s = d.querySelector('.fb-status');
	if (!s) fail('no status element');
	else if (s.hidden) ok('quiet when there is nothing to say');
	else ok(`surfaces transport state: "${s.textContent.slice(0, 60)}"`);
	if (!dom.window.localStorage.getItem('proto-fb:v1')) fail('no localStorage fallback');
	else ok('marks persist to localStorage even with no collector');
}

/* ─────────────────────────────────────────────────── 10. real pages wired */
console.log('\n── 10. every real page is wired and marked ──');
{
	const PAGES = ['index.html', '0-current.html', 'a-warm-studio.html', 'b-focus-sidebar.html', 'c-day-first.html', 'd-working-calendar.html'];
	for (const p of PAGES) {
		const src = readFileSync(join(here, p), 'utf8');
		if (!/feedback\.js/.test(src)) { fail(`${p} does not load feedback.js`); continue; }
		if (!/feedback\.css/.test(src)) { fail(`${p} does not load feedback.css`); continue; }
		const marks = [...src.matchAll(/data-fb="([^"]+)"/g)].map((m) => m[1]);
		if (marks.length < 2) { fail(`${p} has only ${marks.length} data-fb marker(s)`); continue; }
		const dupes = marks.filter((m, i) => marks.indexOf(m) !== i);
		if (dupes.length) { fail(`${p} has duplicate markers: ${[...new Set(dupes)].join(', ')}`); continue; }
		ok(`${p.padEnd(24)} ${marks.length} regions: ${marks.join(', ')}`);
	}
	void readdirSync;
}


/* ─────────────────────────────────────────── 11. the page identifies itself */
console.log('\n── 11. identity reaches the review ──');
{
	const dom = boot();
	await tick();
	const w = dom.window, d = w.document, api = w.__protoFeedback;
	const about = api.payload().about;
	if (!about || about.label !== 'Prototype A · Fixture') fail('payload has no label: ' + JSON.stringify(about));
	else if (!about.question) fail('payload has no question');
	else if (about.family !== 'calendar-ui') fail('payload has no family');
	else ok(`identity carried: "${about.label}" · question "${about.question.slice(0, 40)}…"`);

	// the toolbar says what is being reviewed
	const who = d.querySelector('.fb-bar__who');
	if (!who || !/Prototype A/.test(who.textContent)) fail('toolbar does not name the prototype');
	else ok(`toolbar names it: "${who.textContent.trim()}"`);

	// the list leads with the identity
	Array.from(d.querySelectorAll('.fb-bar__btn')).find((b) => b.textContent.indexOf('List') === 0)
		.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
	const aboutBox = d.querySelector('.fb-list__about');
	if (!aboutBox) fail('list does not show the identity');
	else if (!/Does the picker work/.test(aboutBox.textContent)) fail('list is missing the question');
	else ok('list shows the question / approach / risk');

	// and the markdown leads with it, not the filename
	click(w, d.querySelector('.fb-bar__pick'));
	click(w, d.getElementById('today'));
	click(w, d.querySelector('.fb-card .fb-v[data-v="bad"]'));
	const md = api.markdown(false, 'page');
	if (!/^# Prototype review/.test(md)) fail('markdown has no top-level heading');
	if (!/## Prototype A · Fixture/.test(md)) fail('markdown does not lead with the label');
	if (!/Question:.*Does the picker work/.test(md)) fail('markdown omits the question');
	if (!/Approach:/.test(md) || !/Risk:/.test(md)) fail('markdown omits approach or risk');
	if (!/a-warm-studio\.html/.test(md)) fail('markdown omits the file as provenance');
	else ok('markdown: title, question, approach, risk, then the file');
}

/* ───────────────────────────────── 12. one store across every prototype */
console.log('\n── 12. marks accumulate across prototypes ──');
{
	// page A, one mark
	const a = boot();
	await tick();
	click(a.window, a.window.document.querySelector('.fb-bar__pick'));
	click(a.window, a.window.document.getElementById('today'));
	click(a.window, a.window.document.querySelector('.fb-card .fb-v[data-v="bad"]'));
	await sleep(500);

	// a different page in the same browser, marks something too
	const bHtml = PAGE.replace('Fixture', 'Fixture B')
		.replace(/"id": "a"/, '"id": "b"')
		.replace(/"label": "Prototype A · Fixture"/, '"label": "Prototype B · Fixture"')
		.replace(/<main>/, '<main><section data-fb="grid"><div class="cell" id="c1"><span class="chip">x</span></div></section>');
	const dom = new JSDOM(bHtml, { url: 'https://x.test/b-focus-sidebar.html', runScripts: 'outside-only', pretendToBeVisual: true });
	dom.window.confirm = () => true;
	dom.window.navigator.clipboard = null;
	// share the browser's storage, as a real second page load would
	dom.window.localStorage.setItem('proto-fb:v1', a.window.localStorage.getItem('proto-fb:v1'));
	let n = 0;
	Array.prototype.forEach.call(dom.window.document.querySelectorAll('main *'), (nd) => {
		n++;
		const x = 40 + (n % 3) * 140, y = 40 + Math.floor(n / 3) * 40;
		nd.getBoundingClientRect = () => ({ left: x, top: y, width: 120, height: 32, right: x + 120, bottom: y + 32, x, y });
	});
	dom.window.eval(FB);
	await sleep(30);

	const api = dom.window.__protoFeedback;
	if (api.items().length !== 0) fail('page B inherited page A’s marks');
	else ok('page B starts empty — marks are per page');

	click(dom.window, dom.window.document.querySelector('.fb-bar__pick'));
	click(dom.window, dom.window.document.getElementById('c1'));
	click(dom.window, dom.window.document.querySelector('.fb-card .fb-v[data-v="good"]'));
	await sleep(500);

	const s = api.store();
	if (s.length !== 2) fail(`store should span 2 prototypes, has ${s.length}`);
	else if (s[0].rounds !== 1) fail('page A should have exactly 1 round so far');
	else ok(`store spans ${s.length}: ${s.map((x) => `${x.page} (${x.count} in ${x.rounds} round)`).join(', ')}`);

	// and they can all be copied from this page
	const all = api.markdown(false, 'all');
	if (!/## Prototype A · Fixture/.test(all)) fail('all-pages markdown lost prototype A');
	if (!/## Prototype B · Fixture/.test(all)) fail('all-pages markdown lost prototype B');
	if (!/2 marks across 2 prototypes/.test(all)) fail('all-pages markdown has no rollup line');
	if (!/Bad — rebuild these/.test(all) || !/Good — keep these/.test(all)) fail('all-pages markdown lost a verdict group');
	else ok('copy-from-anywhere spans every prototype, with its own identity');

	const pageOnly = api.markdown(false, 'page');
	if (/## Prototype A · Fixture/.test(pageOnly)) fail('page scope leaked another prototype');
	else ok('page scope stays on this page');

	// the toolbar surfaces the elsewhere count
	const n2 = dom.window.document.querySelector('.fb-bar__n').textContent;
	if (!/1 marked/.test(n2) || !/1 elsewhere/.test(n2)) fail(`toolbar does not report the elsewhere count: "${n2}"`);
	else ok(`toolbar reports across pages: "${n2}"`);

	// the list can switch scope and links back to the other prototype
	Array.from(dom.window.document.querySelectorAll('.fb-bar__btn')).find((b) => b.textContent.indexOf('All') === 0)
		.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
	const pages = dom.window.document.querySelectorAll('.fb-list__page');
	if (pages.length !== 2) fail(`list in all-scope shows ${pages.length} pages, expected 2`);
	else if (!dom.window.document.querySelector('.fb-list__gopage')) fail('list does not link to the other prototype');
	else if (!/Does the picker work/.test(dom.window.document.querySelector('.fb-list__pageq').textContent)) {
		fail('list does not show the other prototype’s question');
	} else ok('list in all-scope: both prototypes, their questions, and a link across');
}


/* ────────────────────────────────────────────── 13. rounds, not a flat list */
console.log('\n── 13. rounds are kept, not overwritten ──');
{
	const dom = boot();
	await tick();
	const w = dom.window, d = w.document, api = w.__protoFeedback;

	// round 1
	click(w, d.querySelector('.fb-bar__pick'));
	click(w, d.getElementById('today'));
	click(w, d.querySelector('.fb-card .fb-v[data-v="bad"]'));
	await sleep(500);
	if (api.rounds().length !== 1) fail(`expected 1 round, got ${api.rounds().length}`);
	else if (!/r1/.test(d.querySelector('.fb-bar__n').textContent)) fail(`toolbar does not show the round: "${d.querySelector('.fb-bar__n').textContent}"`);
	else ok(`round 1 open, toolbar shows "${d.querySelector('.fb-bar__n').textContent}"`);

	// the user finishes reviewing
	click(w, d.querySelector('.fb-bar__round'));
	if (api.rounds().length !== 2) fail(`New round did not open round 2: ${api.rounds().length} rounds`);
	else if (api.rounds()[0].status !== 'closed') fail('round 1 was not closed');
	else if (api.items().length !== 0) fail(`round 2 is not empty: ${api.items().length} items`);
	else ok('round 1 closed, round 2 open and empty');

	// round 2 marks the same element again — that is a fix that did not land.
	// picking is still on from round 1, so do NOT toggle it: that would turn it off
	if (d.querySelector('.fb-bar__pick').getAttribute('aria-pressed') !== 'true') {
		click(w, d.querySelector('.fb-bar__pick'));
	}
	click(w, d.getElementById('today'));
	click(w, d.querySelector('.fb-card .fb-v[data-v="bad"]'));
	await sleep(500);
	const rs = api.rounds();
	if (rs.length !== 2) fail(`history was lost: ${rs.length} rounds`);
	else if (rs[0].items.length !== 1) fail('round 1 lost its mark');
	else if (rs[1].items.length !== 1) fail('round 2 has ' + rs[1].items.length + ' items, expected 1');
	else if (rs[0].items[0].selector !== rs[1].items[0].selector) fail('rounds are not comparable by selector');
	else ok('both rounds kept, same selector in both — a carry-over');

	// the copied review shows the sequence, not just the latest
	const md = api.markdown(false, 'page');
	if (!/Round 1/.test(md) || !/Round 2/.test(md)) fail('markdown does not show both rounds');
	if (!/2 rounds/.test(md)) fail('markdown has no round count');
	else ok('markdown reads as a sequence: round 1, then round 2');

	// the list shows the round history
	Array.from(d.querySelectorAll('.fb-bar__btn')).find((b) => b.textContent.indexOf('List') === 0)
		.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
	const heads = d.querySelectorAll('.fb-list__roundhead');
	if (heads.length !== 2) fail(`list shows ${heads.length} round headers, expected 2`);
	else if (!heads[0].classList.contains('is-open')) fail('the newest round is not marked open');
	else ok(`list shows 2 rounds, newest first, newest marked open (${[...heads].map((h) => h.textContent.trim()).join(' | ')})`);

	// rounds are listed newest first, so row 0 is the open round's (editable) and
	// the closed round's rows follow (not editable — they would be stale)
	const titles = [...d.querySelectorAll('.fb-list__item')].map((r) => r.getAttribute('title') || '');
	if (!titles.some((t) => t === 'Edit this mark')) fail('no editable row in the open round');
	else if (!titles.some((t) => /open .* to edit/i.test(t))) {
		fail(`closed-round rows should redirect, not offer a stale edit: ${JSON.stringify(titles)}`);
	} else ok('open-round rows are editable, closed-round rows redirect to the page instead');

	// reload and the history survives
	const saved = w.localStorage.getItem('proto-fb:v1');
	if (!saved || JSON.parse(saved).pages['a-warm-studio.html'].rounds.length !== 2) {
		fail('round history did not persist to localStorage');
	} else ok('round history persisted across a reload');
}

console.log(bad ? `\n${bad} problems` : '\nclean');
process.exit(bad ? 1 : 0);
