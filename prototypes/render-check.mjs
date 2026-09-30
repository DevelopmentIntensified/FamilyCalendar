/**
 * Does every prototype page actually RENDER, in a real browser?
 *
 * This check exists because the other two render checks lied. app-check §2
 * renders each page under jsdom; serve-check walks the module graph over
 * HTTP without executing it. Both were green while app-ui/models.html showed
 * a completely blank page in Chromium, because an IntersectionObserver was
 * constructed with a `rem` rootMargin and threw — killing module execution
 * before mountApp(). jsdom is not the browser, and a page that serves is not a
 * page that renders.
 *
 *   node prototypes/render-check.mjs
 *
 * Needs the collector up (it is the static server), and Playwright, which the
 * repo already depends on.
 */
import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readdirSync, statSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = 4180;
const BASE = `http://127.0.0.1:${PORT}`;

/** A page that renders must carry real copy, not just the review chrome. */
const MIN_CHARS = 200;

function serverIsUp(port) {
	return new Promise((resolve) => {
		const sock = createConnection({ port, host: '127.0.0.1' });
		const done = (up) => {
			sock.destroy();
			resolve(up);
		};
		sock.once('connect', () => done(true));
		sock.once('error', () => done(false));
		sock.setTimeout(1000, () => done(false));
	});
}

/** Every prototype page, derived from the directory rather than a list.
 *  A SET is any directory holding html — previously the two names were
 *  hardcoded, so a third set was never loaded into a browser and a blank page
 *  in it would have passed this check. */
function pages(dir = ROOT, prefix = '') {
	const out = [];
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry === 'feedback' || entry === 'assets') continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			if (readdirSync(full).some((f) => f.endsWith('.html'))) out.push(...pages(full, `${prefix}/${entry}`));
			continue;
		}
		if (entry.endsWith('.html')) out.push(`${prefix}/${entry}`);
	}
	return out.sort();
}

if (!(await serverIsUp(PORT))) {
	console.log(`\nrender-check: SKIPPED — no collector on ${PORT}`);
	console.log('  start it:  npm run proto:serve\n');
	process.exit(0);
}

const { chromium } = await import('@playwright/test').catch(() => ({}));
if (!chromium) {
	console.log('\nrender-check: SKIPPED — @playwright/test is not installed\n');
	process.exit(0);
}

const all = pages();
const browser = await chromium.launch();
let red = 0;

console.log('');
for (const path of all) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
	await page.goto(BASE + path, { waitUntil: 'networkidle' });
	await page.waitForTimeout(200);
	const len = await page.evaluate(() => (document.body.innerText || '').trim().length);
	await ctx.close();
	// A pageerror is a crash in the page's own code: the same failure that
	// blanked models.html. The review overlay's own 404 is not one.
	const crashes = errors.filter((e) => !/__feedback|404/.test(e));
	if (len < MIN_CHARS || crashes.length) {
		red++;
		console.log(`  FAIL  ${path} — ${len} chars of content`);
		for (const c of crashes) console.log(`          ! ${c}`);
	} else {
		console.log(`  ok    ${path}`);
	}
}
await browser.close();

console.log(red === 0 ? `\nall ${all.length} pages render\n` : `\n${red} of ${all.length} pages do not render\n`);
process.exit(red === 0 ? 0 : 1);
