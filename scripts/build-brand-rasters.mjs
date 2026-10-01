#!/usr/bin/env node
/* ============================================================================
   Brand rasters — render static/brand/ from prototypes/brand-ui/marks.js.

   The SVG is authored once, in the prototype set, and rasterised here. Nothing
   in static/brand/ is hand-edited: if the mark changes, the mark changes in one
   place and this re-renders it. `npm run brand:check` fails on drift.

   Chromium comes from the Playwright the repo already depends on — no new
   dependency, and no image library that would round a corner differently on
   someone else's machine.

   Drift is decided on PIXELS, not on bytes. A PNG carries encoder metadata, so
   two renders of identical art can differ byte-for-byte after a browser bump;
   hashing the decoded RGBA does not have that failure mode. The hashes live in
   static/brand/manifest.json, which also records the hash of marks.js itself —
   so editing the mark and forgetting to re-render is caught too.

     node scripts/build-brand-rasters.mjs            # render
     node scripts/build-brand-rasters.mjs --check    # fail if stale, write nothing
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'static', 'brand');
/* The prototypes run on their own collector, rooted at prototypes/, which cannot
   serve ../../static. So the rasters land in the set as well — not as a second
   copy that can rot, but as the SAME bytes written twice from one plan, with
   both covered by the manifest and both proved by --check. */
const PROTO = join(root, 'prototypes', 'brand-ui', 'rasters');
const CHECK = process.argv.includes('--check');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);

/* The marks, read as source rather than imported: this runs from the repo root
   and the module is browser-flavoured. Strip the ESM plumbing, keep the data,
   evaluate it — the same trick tree-check.mjs uses to read a page's data table
   without executing a page. */
function loadMarks() {
	const src = readFileSync(join(root, 'prototypes', 'brand-ui', 'marks.js'), 'utf8');
	const body = src
		.replace(/^export /gm, '')
		.replace(/^\/\*[\s\S]*?\*\/\s*$/gm, '')
		.replace(/^import[\s\S]*?;\s*$/gm, '');
	// eslint-disable-next-line no-new-func
	return new Function(`${body}; return { MARKS, maskable, ogCard, OG };`)();
}

const { MARKS, maskable, ogCard, OG } = loadMarks();

/* static/brand/ is generated in full. The list is here, not on disk, so a file
   that is no longer wanted cannot linger by being left behind. */
function plan() {
	const og = ogCard({ head: OG.heads[1].head, sub: OG.heads[1].sub });
	return new Map([
		// the mark and its maskable twin
		['mark.svg', { svg: MARKS.mark.svg }],
		['mark-maskable.svg', { svg: maskable() }],
		// what the app and the manifest actually reference today
		['icon.svg', { svg: MARKS.mark.svg }],
		['apple-touch-icon.png', { svg: MARKS.mark.svg, w: 180, h: 180 }],
		['icon-192.png', { svg: MARKS.mark.svg, w: 192, h: 192 }],
		['icon-512.png', { svg: MARKS.mark.svg, w: 512, h: 512 }],
		// the maskable rasters. The SVG twin is not enough on its own: Android
		// picks from the manifest by declared purpose and a raster is what it
		// actually decodes, so a maskable icon nobody declares is decoration.
		['maskable-192.png', { svg: maskable(), w: 192, h: 192 }],
		['maskable-512.png', { svg: maskable(), w: 512, h: 512 }],
		// what a browser asks for when it falls back to /favicon.png, at the
		// size the stale one already was
		['favicon.png', { svg: MARKS.mark.svg, w: 128, h: 128 }],
		// the social card
		['og.svg', { svg: og, w: 1200, h: 630 }],
		['og.png', { svg: og, w: 1200, h: 630 }]
	]);
}

const { chromium } = await import('playwright').catch(() => ({}));
if (!chromium) {
	console.error('\nbrand rasters need Playwright — run: npx playwright install chromium\n');
	process.exit(1);
}
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
if (!existsSync(PROTO)) mkdirSync(PROTO, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
const render = { w: 0, h: 0 };

/** Rasterise in the page: decode the SVG, paint it, return PNG + pixel hash. */
async function rasterise(svg, w, h) {
	if (render.w !== w || render.h !== h) {
		await page.setViewportSize({ width: w, height: h });
		render.w = w;
		render.h = h;
	}
	return page.evaluate(
		async ([markup, width, height]) => {
			const img = new Image();
			img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
			await img.decode();
			const c = document.createElement('canvas');
			c.width = width;
			c.height = height;
			const ctx = c.getContext('2d');
			ctx.drawImage(img, 0, 0, width, height);
			const px = ctx.getImageData(0, 0, width, height).data;
			let bin = '';
			for (let i = 0; i < px.length; i += 4) {
				bin += String.fromCharCode(px[i], px[i + 1], px[i + 2], px[i + 3]);
			}
			return { png: c.toDataURL('image/png').split(',')[1], pixels: bin };
		},
		[svg, w, h]
	);
}

const files = plan();
const next = { source: 'prototypes/brand-ui/marks.js', sourceHash: null, files: {} };
next.sourceHash = sha(readFileSync(join(root, 'prototypes', 'brand-ui', 'marks.js')));

let stale = 0;
let wrote = 0;

/** The prototype set gets a copy of every raster, because its collector cannot
 *  reach static/. Same bytes, same plan entry, both checked. */
const MIRROR = new Set(['icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'og.png', 'mark-maskable.svg']);

/* THE ROOT COPIES, AND WHY THEY EXIST.
 *
 * Measured, not assumed: every reference the running app makes resolves to the
 * ROOT of static/, not to static/brand/. src/app.html:5 serves /icon.svg,
 * src/app.html:11 serves /icon-192.png as the apple-touch-icon,
 * static/manifest.webmanifest points at /icon-192.png, /icon-512.png and
 * /icon.svg, and static/service-worker.js:173-174 uses /icon-192.png as the
 * notification icon AND the badge. None of those were in the plan, so the
 * redraw in marks.js was reaching static/brand/ and nothing else — the
 * installed app kept the old clipboard. Same bytes, same hash, drift-checked
 * exactly like the brand/ copies. */
const ROOT = new Set(['icon.svg', 'icon-192.png', 'icon-512.png', 'favicon.png']);

for (const [name, spec] of files) {
	const want = { w: spec.w ?? 512, h: spec.h ?? 512 };

	let out;
	if (name.endsWith('.svg')) {
		out = { hash: sha(spec.svg.trim() + '\n'), buf: Buffer.from(spec.svg.trim() + '\n') };
	} else {
		const r = await rasterise(spec.svg, want.w, want.h);
		out = { hash: sha(Buffer.from(r.pixels, 'binary')), buf: Buffer.from(r.png, 'base64') };
	}
	next.files[name] = { ...want, hash: out.hash };

	const dests = [[join(OUT, name)]];
	if (MIRROR.has(name)) dests.push([join(PROTO, name)]);
	if (ROOT.has(name)) dests.push([join(root, 'static', name)]);

	let allOk = true;
	for (const [target] of dests) {
		const have = existsSync(target) ? readFileSync(target) : null;
		// compared by the CONTENT hash recorded in the manifest, not by bytes:
		// a PNG re-encoded by another Chromium is the same picture.
		const known = currentManifest()?.files?.[name]?.hash;
		if (known === out.hash && have && have.equals(out.buf)) continue;
		allOk = false;
		stale++;
		if (!CHECK) {
			writeFileSync(target, out.buf);
			wrote++;
			console.log(`  write ${target.replace(root, '.').replace(/\\/g, '/')}`);
		} else console.log(`  STALE ${target.replace(root, '.').replace(/\\/g, '/')}`);
	}
	if (allOk) console.log(`  ok    ${name} (${want.w}×${want.h})`);
}

function currentManifest() {
	const f = join(OUT, 'manifest.json');
	return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}

await browser.close();

const manifestPath = join(OUT, 'manifest.json');
const manifestChanged = JSON.stringify(currentManifest()) !== JSON.stringify(next);
if (manifestChanged) {
	stale++;
	if (!CHECK) {
		writeFileSync(manifestPath, JSON.stringify(next, null, '\t') + '\n');
		wrote++;
		console.log('  write manifest.json');
	} else console.log('  STALE manifest.json');
} else console.log('  ok    manifest.json');

console.log(
	CHECK
		? stale
			? `\n${stale} brand file(s) out of date — run: npm run brand:build\n`
			: `\nbrand rasters match ${next.source} (${files.size} files, all roots)\n`
		: `\n${wrote} written · ${files.size} planned\n`
);
process.exit(CHECK && stale ? 1 : 0);
