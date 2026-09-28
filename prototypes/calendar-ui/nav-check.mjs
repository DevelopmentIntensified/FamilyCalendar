/* Verifies the prototype switcher: mounts on every page, marks the current
   one, links resolve, and nothing collides with the FAB / bulk bar / sheets.
   Run: node prototypes/calendar-ui/nav-check.mjs                                     */
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith('.html')).sort();
// The switcher must link to every page, so derive that list from the directory
// rather than hardcoding it — a stale list then fails as if the product broke.
const EXPECTED = files;

let bad = 0;
const fail = (m) => { bad++; console.log('  FAIL ' + m); };

console.log('\n── switcher mounts on every page ──');
for (const f of files) {
	const src = readFileSync(join(here, f), 'utf8');
	// does the page actually load the switcher?
	if (!/proto-nav\.js/.test(src)) { fail(`${f} does not load proto-nav.js`); continue; }

	// `outside-only` gives window.eval a real global scope without executing
	// any <script> in the page itself
	const dom = new JSDOM(src, { url: `https://x.test/${f}`, runScripts: 'outside-only' });
	// proto-nav.js is an external classic script; jsdom won't fetch over https,
	// so eval the real source to exercise the actual code path
	dom.window.eval(readFileSync(join(here, 'proto-nav.js'), 'utf8'));
	// readyState is still 'loading' at this point, so proto-nav is parked on
	// DOMContentLoaded — let the event loop deliver it
	await new Promise((r) => setTimeout(r, 0));
	const doc = dom.window.document;

	const el = doc.querySelector('.proto-switch');
	if (!el) { fail(`${f} — switcher did not mount`); continue; }

	const btns = [...el.querySelectorAll('.proto-switch__btn')];
	if (btns.length !== EXPECTED.length) fail(`${f} — ${btns.length} buttons, expected ${EXPECTED.length}`);

	const hrefs = btns.map((b) => b.getAttribute('href'));
	const missing = EXPECTED.filter((h) => !hrefs.includes(h));
	if (missing.length) fail(`${f} — missing links: ${missing.join(', ')}`);

	const active = btns.filter((b) => b.classList.contains('is-active'));
	if (active.length !== 1) fail(`${f} — ${active.length} active buttons, expected exactly 1`);
	else if (active[0].getAttribute('href') !== f) {
		fail(`${f} — active points at ${active[0].getAttribute('href')}, expected ${f}`);
	}
	if (!active[0].hasAttribute('aria-current')) fail(`${f} — active button missing aria-current`);

	// every button needs an accessible name at both label widths
	const unnamed = btns.filter((b) => !b.textContent.trim() && !b.getAttribute('title'));
	if (unnamed.length) fail(`${f} — ${unnamed.length} unnamed buttons`);

	// z-index must stay under the FAB (70), bulk bar (75), pill (85), sheets (80/90)
	const z = el.style.zIndex || getComputedRule(f, '.proto-switch');
	const zn = parseInt(z, 10);
	if (!Number.isNaN(zn) && zn >= 70) fail(`${f} — z-index ${zn} would float over modals`);

	console.log(`  ok   ${f.padEnd(24)} ${btns.length} buttons, active → ${active[0].getAttribute('href')}`);
}

function getComputedRule(file, selector) {
	const src = readFileSync(join(here, file), 'utf8');
	const m = src.match(new RegExp(selector.replace('.', '\\.') + '\\s*\\{[^}]*z-index\\s*:\\s*(\\d+)'));
	return m ? m[1] : '';
}

console.log('\n── no collisions with fixed chrome ──');
{
	// FAB: bottom-right. bulk bar: bottom-centre. toaster: bottom-right md+.
	const css = readFileSync(join(here, 'proto.css'), 'utf8');
	const sw = css.match(/\.proto-switch\s*\{[^}]*left:\s*1rem;[^}]*bottom:\s*1rem/);
	sw ? console.log('  ok   switcher anchored bottom-left') : fail('switcher not anchored bottom-left');

	const fab = css.match(/\.fab\s*\{[^}]*right:\s*1\.5rem;[^}]*bottom:\s*1\.5rem/);
	fab ? console.log('  ok   FAB owns bottom-right (no overlap)') : fail('FAB position changed — recheck the switcher');

	const bulk = css.match(/\.bulkbar\s*\{[^}]*left:\s*50%/);
	bulk ? console.log('  ok   bulk bar owns bottom-centre (no overlap)') : fail('bulk bar position changed');

	const baseline = readFileSync(join(here, '0-current.html'), 'utf8');
	const hasBody = /<body class="has-fixed-footer">/.test(baseline);
	const hasRule = /has-fixed-footer\s+\.proto-switch\s*\{[^}]*bottom:\s*3\.75rem/.test(css);
	if (hasBody && hasRule) {
		console.log('  ok   baseline lifted to clear its full-width footer');
	} else {
		fail(`baseline footer clearance missing (body=${hasBody}, rule=${hasRule})`);
	}
}

console.log(bad ? `\n${bad} problems` : '\nclean');
process.exit(bad ? 1 : 0);
