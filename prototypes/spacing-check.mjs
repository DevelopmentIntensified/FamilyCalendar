/* ============================================================================
   Spacing check — nothing touches, containers breathe, bands stay compact.

   A spacing pass with no guard is a one-time opinion. This is the floor: it
   measures every page in both sets, in a real layout engine, at two
   viewports, and fails on the three things the pass is about.

     1  NOTHING TOUCHES    two adjacent blocks share an edge      (floor 8px)
     2  CONTAINERS BREATHE a card holds content at its own frame  (floor 8px)
     3  COMPACT BUT RELAXED a declared vertical gap is too wide    (ceiling 24px)

   MEASURED, NOT EYEBALLED. No browser is attached to the review work, so the
   check brings one: every number comes from Chromium —
   getBoundingClientRect() for the boxes, getComputedStyle() for the padding.
   Nothing is inferred from reading the CSS. A rule that says `gap: 1rem` on a
   box that never lays out that way reports 0px and fails, which is the whole
   point: b-focus-sidebar's dead `.grid` class looks like a grid in the markup
   and was a flush block stack on screen.

   GROUND RULE 7. A cramped page that is cramped *because the app is cramped*
   stays cramped. Those subtrees are marked `data-spacing="app"` with a
   `data-spacing-why`, this check prints them, and it refuses an unmarked
   excuse or an excuse with no reason. Smoothing a real defect away would
   hide it from the next reviewer, so the escape hatch is loud, not silent.

   Run: node prototypes/spacing-check.mjs
   ========================================================================== */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/* The floor, in px. 8px reads as a gap at a glance and 24px is the widest a
   band between two blocks gets before it stops being compact. */
const MIN_GAP = 8;
const MAX_GAP = 24;
const MIN_PAD = 8;
const EPS = 0.5;      // sub-pixel slack; borders round
const TOL = 0.75;     // measured geometry wobbles a hair between runs

const VIEWPORTS = [
	{ name: 'mobile', width: 390, height: 844 },
	{ name: 'desktop', width: 1280, height: 900 }
];

/* Review chrome: the overlay, the dock and the switcher are scaffolding, not
   the design under review. Transient surfaces are excluded for the same
   reason — a toast has no meaningful content padding. */
const CHROME =
	'[class*="fb-"], .proto-switch, .fab, .bulkbar, .toast, .sheet, .sheet-scrim, .rangepill, .orb, .b-drawer';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

let bad = 0;
const fail = (m) => { bad++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);

/* Outstanding breaches on pages a different wave owns. Listing them is the
   honest alternative to editing another agent's work or switching the guard
   off: §3b fails if an entry stops matching, so the list cannot rot. */
const KNOWN = JSON.parse(readFileSync(join(here, 'spacing-known.json'), 'utf8')).outstanding;

/* Sets are discovered, not listed. A hardcoded pair here means a new set is
   never measured, and a spacing breach in it goes unreported forever — which is
   the same silent-pass this file exists to prevent. */
const SETS = readdirSync(here, { withFileTypes: true })
	.map((d) => d.name)
	.filter((n) => {
		if (n === 'feedback' || !statSync(join(here, n)).isDirectory()) return false;
		return readdirSync(join(here, n)).some((f) => f.endsWith('.html'));
	})
	.sort();

const PAGES = SETS.flatMap((set) => readdirSync(join(here, set))
	.filter((f) => f.endsWith('.html'))
	.map((f) => `${set}/${f}`))
	.sort();

/* ── 0. the browser ───────────────────────────────────────────────────── */
let chromium;
try {
	({ chromium } = await import('playwright'));
} catch {
	console.log('\nspacing check needs Playwright — run: npx playwright install chromium');
	process.exit(1);
}

/* ES modules are blocked on file:// (see README), so the check serves the
   estate itself on an ephemeral port rather than depending on the collector
   being up. A guard that skips when you forget a server is not a guard. */
const server = createServer((req, res) => {
	let p = decodeURIComponent(req.url.split('?')[0]);
	if (p.endsWith('/')) p += 'index.html';
	const full = join(here, normalize(p).replace(/^([/\\])+/, ''));
	if (!existsSync(full) || !statSync(full).isFile()) { res.writeHead(404); return res.end('not found'); }
	res.writeHead(200, { 'content-type': MIME[extname(full)] || 'application/octet-stream' });
	res.end(readFileSync(full));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
	browser = await chromium.launch();
} catch (e) {
	server.close();
	console.log('\nspacing check could not launch Chromium — run: npx playwright install chromium');
	console.log('  ' + e.message.split('\n')[0]);
	process.exit(1);
}

/* ── the measurement, run inside the page ─────────────────────────────── */
function collect(RULES) {
	const { MIN_GAP, MAX_GAP, MIN_PAD, EPS, TOL, CHROME } = RULES;
	const px = (v) => parseFloat(v) || 0;
	/** a stable, short path a reviewer can find in the file */
	const label = (n) => {
		const s = [];
		for (let p = n; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
			let t = p.tagName.toLowerCase();
			if (p.id) t += '#' + p.id;
			else if (p.className && typeof p.className === 'string') t += '.' + p.className.trim().split(/\s+/).slice(0, 2).join('.');
			s.unshift(t);
		}
		return s.slice(-3).join(' > ');
	};
	/* WHAT COUNTS AS A BLOCK. A spacing guard that flags every chip row is a
	   guard that gets switched off, so it draws one line and holds it:

	     · a BLOCK is a framed, shadowed, or filled box holding STRUCTURE — a
	       card, a panel, a section, a calendar cell. Blocks must not touch.
	     · a ROW is a hairline-ruled line inside a block (`.kv + .kv`). The
	       block's own padding is the spacing; a 1px rule is the separator and
	       the rows are one band, not N blocks. A row has no fill, no shadow
	       and no frame, so it falls out as not-a-block without a special case.
	     · a LABEL or chip is a filled leaf, or a filled box wrapping one run
	       of inline text. A column-name chip stays a chip however many lines
	       it wraps to, which a size threshold would get wrong.
	     · a CONTROL is a button, link or input. Controls in a row are dense
	       ON PURPOSE; that density is a design-review finding, not a spacing
	       defect, so the floor does not apply to them.
	     · a TRACK clips itself to a fixed height (a proportional bar, a
	       segmented control). Its segments are parts of one control, so flush
	       is what they are for.

	   Overlap is not measured either: stacked avatars are a deliberate idiom,
	   and this guard is about space, not collision detection. */
	const CONTROL = /^(BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL)$/;
	const BLOCKLEVEL = /^(block|flex|grid|list-item|table|flow-root|table-row-group)$/;
	const isControl = (n) => CONTROL.test(n.tagName) || n.getAttribute('role') === 'button';
	const isBlock = (n) => {
		if (isControl(n)) return false;
		if (!n.children.length) return false;   // a filled leaf is a chip, not a card
		const c = getComputedStyle(n);
		// a box that clips itself to a fixed height is a TRACK or a window, and
		// its segments are parts of one control — flush is what they are for
		if (c.overflowY === 'hidden' && c.height !== 'auto') return false;
		const sides = ['Top', 'Right', 'Bottom', 'Left'].filter((s) => px(c['border' + s + 'Width']) > EPS);
		if (sides.length >= 2 || sides.some((s) => px(c['border' + s + 'Width']) >= 2)) return true;
		if (c.boxShadow !== 'none') return true;
		// a filled box holding STRUCTURE is a surface; a filled box holding one
		// run of inline text is a label, however many lines it wraps to
		const structured = [...n.children].some((k) => BLOCKLEVEL.test(getComputedStyle(k).display));
		return structured && c.backgroundColor !== 'rgba(0, 0, 0, 0)';
	};
	/** a WELD is a shared edge with a squared corner on it — the calendar frame
	    and its toolbar, or a key strip bolted under a grid. Two blocks that
	    merely happen to touch keep all four corners rounded, so they are not
	    welded and the rule applies to them. */
	const welded = (lower, upper) => {
		const a = getComputedStyle(lower), b = getComputedStyle(upper);
		const flatBottom = px(a.borderBottomLeftRadius) <= EPS && px(a.borderBottomRightRadius) <= EPS;
		const flatTop = px(b.borderTopLeftRadius) <= EPS && px(b.borderTopRightRadius) <= EPS;
		return flatBottom || flatTop;
	};
	const inFlow = (n) => {
		const c = getComputedStyle(n);
		if (c.display === 'none' || c.display === 'inline' || c.visibility === 'hidden') return false;
		if (c.position === 'absolute' || c.position === 'fixed') return false;
		const r = n.getBoundingClientRect();
		return r.width > 1 && r.height > 1;
	};
	/** the excuse, if this subtree carries one, and whether it is a real one */
	const excuse = (n) => {
		const host = n.closest('[data-spacing]');
		if (!host) return null;
		return { kind: host.getAttribute('data-spacing'), why: (host.getAttribute('data-spacing-why') || '').trim(), at: label(host) };
	};

	const findings = [];
	const seen = new Set();
	const push = (rule, n, msg) => {
		const key = rule + '@' + label(n) + msg;
		if (seen.has(key)) return;
		seen.add(key);
		findings.push({ rule, sel: (n.parentElement ? label(n.parentElement) + ' >> ' : '') + label(n), msg, excused: excuse(n) });
	};

	for (const el of document.querySelectorAll('body *')) {
		if (el.closest(CHROME)) continue;
		const cs = getComputedStyle(el);
		if (cs.display === 'none' || cs.visibility === 'hidden') continue;
		const r = el.getBoundingClientRect();
		if (r.width < 2 || r.height < 2) continue;

		/* 2 · CONTAINERS BREATHE — a card that wraps a band of content needs
		   padding on the sides its content reaches.

		   The subtlety is that a full-bleed child DELEGATES the padding
		   inward: .navbar > .wrap is fine because the wrap carries the
		   padding. So a side only violates when a child both reaches the
		   frame AND brings no padding of its own with it. Testing "is the
		   child full-bleed" on its own is circular — deleting the padding
		   makes every child full-bleed, which would then excuse the very
		   thing that was deleted.

		   Two further exclusions, each because the element is not a content
		   card at all:
		     · child-sized — a frame exactly as tall as its tallest child has no
		                     band of content to inset: the children ARE the
		                     frame. That is a control bar (`.iconb-bare` and
		                     friends in a 2.5rem pill) and it is a full-bleed
		                     strip (`.cal-dowrow`, whose cells fill the row and
		                     carry their own inset).
		     · all-controls — a frame of buttons is a control bar; the buttons
		                     carry their own padding */
		const kids = [...el.children].filter(inFlow);
		const tallestChild = Math.max(0, ...kids.map((k) => k.getBoundingClientRect().height));
		// the band's height is the frame's CONTENT box, so its own border does
		// not count as a band — a header strip with a 1px bottom rule is not
		// holding content that needs padding
		const band = r.height - px(cs.borderTopWidth) - px(cs.borderBottomWidth) - tallestChild;
		if (isBlock(el) && band > TOL && kids.length >= 2 && !kids.every(isControl)) {
			const SIDES = [
				['top', cs.paddingTop, (kr) => kr.top - r.top - px(cs.borderTopWidth), 'paddingTop'],
				['bottom', cs.paddingBottom, (kr) => r.bottom - kr.bottom - px(cs.borderBottomWidth), 'paddingBottom'],
				['left', cs.paddingLeft, (kr) => kr.left - r.left - px(cs.borderLeftWidth), 'paddingLeft'],
				['right', cs.paddingRight, (kr) => r.right - kr.right - px(cs.borderRightWidth), 'paddingRight']
			];
			for (const [side, pad, edge, kSide] of SIDES) {
				const p = px(pad);
				if (p >= MIN_PAD - EPS) continue;         // this side already breathes
				// measured from the frame's PADDING edge, so the frame's own 1px
				// border is not mistaken for the padding it is supposed to have
				const atFrame = kids.find((k) =>
					edge(k.getBoundingClientRect()) <= p + TOL && px(getComputedStyle(k)[kSide]) < MIN_PAD - EPS);
				if (atFrame) {
					push('padding', el, `content at ${p}px from the ${side}, floor is ${MIN_PAD}px — ${label(atFrame)} brings no padding`);
				}
			}
		}
		if (kids.length < 2) continue;

		/* 1 + 3 · sibling spacing, on the axis the container actually stacks on.
		   Measured from the boxes, so a rule that declares a gap the layout
		   never applied reports 0 and fails — which is the point: it catches
		   b-focus-sidebar's dead `.grid` class, which looks like a grid in the
		   markup and lays out as a block with no gap at all. */
		const items = kids.filter(isBlock).map((k) => ({ k, r: k.getBoundingClientRect() }));
		if (items.length < 2) continue;
		const rowFlow = (cs.display === 'flex' || cs.display === 'inline-flex') && cs.flexDirection.startsWith('row');
		const pairs = [];
		if (rowFlow) {
			// lanes: a row wraps, so only compare what shares a line
			const lanes = new Map();
			for (const it of items.slice().sort((a, b) => a.r.left - b.r.left)) {
				const key = Math.round(it.r.top / 8);
				if (!lanes.has(key)) lanes.set(key, []);
				lanes.get(key).push(it);
			}
			for (const lane of lanes.values())
				for (let i = 1; i < lane.length; i++) pairs.push([lane[i - 1], lane[i], false]);
		} else if (cs.display === 'grid') {
			// a grid stacks on both axes; let the boxes say which
			for (let i = 1; i < items.length; i++) {
				const a = items[i - 1], b = items[i];
				const vOverlap = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
				pairs.push([a, b, vOverlap <= Math.min(a.r.height, b.r.height) * 0.5]);
			}
		} else {
			const byTop = items.slice().sort((a, b) => a.r.top - b.r.top);
			for (let i = 1; i < byTop.length; i++) pairs.push([byTop[i - 1], byTop[i], true]);
		}

		for (const [a, b, vertical] of pairs) {
			const g = +(vertical ? b.r.top - a.r.bottom : b.r.left - a.r.right).toFixed(1);
			// negative is a deliberate overlap (stacked avatars, a progress fill);
			// exactly zero is the collision this check exists to catch.
			if (g < -EPS) continue;
			if (vertical && welded(b.k, a.k)) continue;  // one surface in two parts
			if (g < MIN_GAP - EPS) {
				push('touching', b.k, `blocks ${g}px apart, floor is ${MIN_GAP}px`);
			} else if (vertical) {
				/* 3 · COMPACT BUT RELAXED. The ceiling bites on the number
				   someone TYPED, not on the distance the layout produced: a
				   declared row-gap or margin-top over MAX_GAP is a band that
				   grew for the sake of air. Free space a layout hands out —
				   space-between, an auto margin, a 1fr track — is the layout
				   working, and a guard that flags it gets switched off. */
				const declared = Math.max(px(cs.rowGap), px(getComputedStyle(b.k).marginTop));
				if (declared > MAX_GAP + TOL) {
					push('airy', b.k, `declared ${declared}px of vertical separation, ceiling is ${MAX_GAP}px`);
				}
			}
		}
	}
	return { findings, excused: [...document.querySelectorAll('[data-spacing]')].map((n) => ({ kind: n.getAttribute('data-spacing'), why: (n.getAttribute('data-spacing-why') || '').trim(), at: label(n) })) };
}

/* ── 1. measure every page, at every viewport ────────────────────────── */
const RULES = { MIN_GAP, MAX_GAP, MIN_PAD, EPS, TOL, CHROME };
console.log(`\n── 1. measuring ${PAGES.length} pages in Chromium at ${VIEWPORTS.map((v) => v.name).join(' and ')} ──`);
const all = new Map();      // page → Map(viewport → findings[])
const excuses = [];

for (const rel of PAGES) {
	all.set(rel, new Map());
	for (const vp of VIEWPORTS) {
		const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
		const errs = [];
		page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
		try {
			await page.goto(`${BASE}/${rel}`, { waitUntil: 'networkidle' });
			await page.waitForTimeout(400);
			const res = await page.evaluate(collect, RULES);
			all.get(rel).set(vp.name, res.findings);
			for (const e of res.excused) if (!excuses.some((x) => x.at === e.at && x.page === rel)) excuses.push({ ...e, page: rel });
		} catch (e) {
			all.get(rel).set(vp.name, [{ rule: 'load', sel: rel, msg: e.message.split('\n')[0], excused: null }]);
		}
		if (errs.length) fail(`${rel} @${vp.name} threw — ${errs[0]}`);
		await page.close();
	}
}

/* A finding counts once: a defect that only appears at 390px is a mobile
   defect, and the two viewports must not double the report. */
const report = new Map();
for (const [rel, byVp] of all) {
	const merged = new Map();
	for (const [vp, list] of byVp) for (const f of list) {
		const k = f.rule + '|' + f.sel;
		if (!merged.has(k)) merged.set(k, { ...f, vps: [] });
		merged.get(k).vps.push(vp);
	}
	report.set(rel, [...merged.values()]);
}

/* ── 2. the floor holds ──────────────────────────────────────────────── */
console.log('\n── 2. nothing touches, containers breathe, bands stay compact ──');
let clean = 0;
let known = 0;
for (const [rel, list] of report) {
	const live = list.filter((f) => !f.excused && !KNOWN.some((k) => k.page === rel && f.sel.includes(k.sel)));
	const excused = list.filter((f) => f.excused);
	for (const f of live) known++;
	if (live.length) {
		for (const f of live.slice(0, 6)) fail(`${rel.padEnd(34)} ${f.rule.padEnd(8)} ${f.msg}  [${f.sel}] (${f.vps.join(', ')})`);
		if (live.length > 6) fail(`${rel.padEnd(34)} … and ${live.length - 6} more`);
	} else {
		clean++;
		const bits = [];
		if (excused.length) bits.push(`${excused.length} reproduced-from-the-app`);
		if (list.length - excused.length) bits.push(`${list.length - excused.length} known`);
		ok(`${rel.padEnd(34)} ${bits.length ? bits.join(' · ') : 'clean'}`);
	}
}

/* ── 3. the escape hatches are earned, not decorative ───────────────── */
console.log('\n── 3. every excuse and every known defect is accounted for ──');
{
	// 3a · ground rule 7 — a reproduced app defect must be marked and explained
	const kindOk = new Set(['app', 'track']);
	const unmarked = excuses.filter((e) => !kindOk.has(e.kind));
	const unreasoned = excuses.filter((e) => !(e.why.length > 24));
	if (unmarked.length) fail(`data-spacing with an unknown value: ${unmarked.map((e) => `${e.page} ${e.at}="${e.kind}"`).join(', ')} — use "app" or "track"`);
	if (unreasoned.length) fail(`data-spacing without a reason: ${unreasoned.map((e) => `${e.page} ${e.at}`).join(', ')} — a full sentence is required, so nobody can quieten a finding by hand`);
	if (!unmarked.length && !unreasoned.length) {
		if (!excuses.length) ok('no page is claiming a reproduced defect — every page holds the floor on its own');
		else for (const e of excuses) ok(`${e.page.padEnd(34)} ${e.kind.padEnd(5)} ${e.at} — ${e.why}`);
	}

	// 3b · the known list must still be true, or it is a place bugs go to hide
	const stale = KNOWN.filter((k) => ![...report.get(k.page) || []].some((f) => f.sel.includes(k.sel)));
	if (stale.length) {
		fail(`${stale.length} known-defect entr${stale.length === 1 ? 'y is' : 'ies are'} stale — the page no longer reports it, so delete the entry: ${stale.map((k) => `${k.page} [${k.sel}]`).join(', ')}`);
	} else if (KNOWN.length) {
		for (const k of KNOWN) ok(`${k.page.padEnd(34)} known    ${k.sel} — ${k.why}`);
	} else {
		ok('no known defects outstanding');
	}
}

console.log(`\n${clean}/${PAGES.length} pages clear · ${known} unacknowledged finding(s)` +
	(excuses.length ? ` · ${excuses.length} reproduced from the app and still shown` : '') +
	(KNOWN.length ? ` · ${KNOWN.length} known and still open in spacing-known.json` : '') +
	`\nfloor: ${MIN_GAP}px between blocks, ${MIN_PAD}px inside a frame, ${MAX_GAP}px declared ceiling`);

await browser.close();
server.close();
console.log(bad ? `\n${bad} problems` : '\nclean');
process.exit(bad ? 1 : 0);
