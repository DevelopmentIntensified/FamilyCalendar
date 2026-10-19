// Stage 1 of 3: render frames to disk. Resumable — an existing non-empty frame is skipped,
// so you can kill this at any point and run the identical command again to carry on.
//   RES=2  3840x2160 (default)   RES=1  1920x1080, for a fast proof before the big pass
//   VERTICAL=1  1080x1920 (RES=1) or 2160x3840 (RES=2): separate 9:16 composition, separate frame dir
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { THREADS, CORES } from './threads.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');

const name  = process.argv[2] || 'master';
const start = +(process.argv[3] ?? 0);
const end   = +(process.argv[4] ?? 45);
const fps   = +(process.argv[5] ?? 25);
const RES   = +(process.env.RES || 2);
const VERT = process.env.VERTICAL === '1';
const DIR   = path.join(OUT, VERT ? `frames-vertical-${RES === 2 ? '2160' : '1080'}` : `frames-${RES === 2 ? '2160' : '1080'}`);
const VW = VERT ? 1080 : 1920, VH = VERT ? 1920 : 1080;

fs.mkdirSync(DIR, { recursive: true });
const logFile = path.join(OUT, 'capture.log');
const log = m => {
  const s = `[${new Date().toISOString().slice(11, 19)}] ${m}`;
  console.log(s);
  fs.appendFileSync(logFile, s + '\n');
};

/* Frames on disk are only reusable if they were rendered from the film we have now.
   Without this check, edit film.html, re-run, and the resumable skip hands back the old
   film with your fixes silently absent — the worst possible failure mode here. */
const SRC = path.join(HERE, 'film.html');
const sha = crypto.createHash('sha1').update(fs.readFileSync(SRC)).digest('hex');
const STAMP = path.join(DIR, '.source-sha1');
let prev = null;
try { prev = fs.readFileSync(STAMP, 'utf8').trim(); } catch { /* first run */ }
if (prev && prev !== sha) {
  console.error(`\n  STOP: ${DIR} holds frames rendered from a different film.html.`);
  console.error(`        film.html has changed since they were made, so resuming would`);
  console.error(`        hand back the old film with the new fixes missing.`);
  console.error(`\n        rm -r ${DIR}          # PowerShell: Remove-Item -Recurse -Force ${DIR}`);
  console.error(`\n  If these frames are known-good and you only touched something else,`);
  console.error(`  delete ${STAMP} to resume from them.`);
  process.exit(1);
}
if (!prev) fs.writeFileSync(STAMP, sha);

const total = Math.round((end - start) * fps);
log(`capture ${name}  ${start}-${end}s @${fps}fps  ${total} frames  RES=${RES} (${VERT ? `${VW * RES}x${VH * RES} vertical` : (RES === 2 ? '3840x2160' : '1920x1080')})  ${CORES} cores, ffmpeg will use ${THREADS}`);

const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--font-render-hinting=none'] });
const ctx = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: RES,
  colorScheme: 'light',
});
const page = await ctx.newPage();
page.on('pageerror', e => log(`PAGE ERROR: ${e.message}`));
await page.goto(pathToFileURL(path.join(HERE, 'film.html')).href + (VERT ? '?vertical=1' : ''));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);

/* the timeline must be a function before we spend hours rendering it */
const probe = await page.evaluate(() => {
  window.setTime(19.5);
  return {
    cards: [...document.querySelectorAll('.ecard')].map(c => +c.style.opacity || 0),
    scroll: document.querySelector('#chatA').scrollHeight - document.querySelector('#s2 .chatwin').clientHeight,
  };
});
if (!probe.cards.some(n => n > 0.5)) { log('FAIL: the parse cards never appear'); process.exit(1); }
if (probe.scroll < 300) { log('FAIL: the chat does not scroll'); process.exit(1); }
log(`probe ok  cards@19.5s=${probe.cards.map(n => n.toFixed(2)).join(',')}  chatScroll=${probe.scroll}px`);

const frameAt = i => path.join(DIR, `${String(i).padStart(5, '0')}.png`);
let made = 0, reused = 0;
const t0 = Date.now();

for (let i = 0; i < total; i++) {
  const f = frameAt(i);
  let ok = false;
  try { ok = fs.statSync(f).size > 1024; } catch { /* not there yet */ }
  if (ok) { reused++; continue; }

  await page.evaluate(tt => window.setTime(tt), start + i / fps);
  await page.screenshot({ path: f, type: 'png' });
  made++;

  if (made % 25 === 0 || i === total - 1) {
    const el = (Date.now() - t0) / 1000;
    const rate = made / Math.max(el, 0.001);
    log(`  ${i + 1}/${total}  new=${made} reused=${reused}  ${el.toFixed(0)}s  ${rate.toFixed(2)} fps  eta ${((total - i - 1) / Math.max(rate, 0.01)).toFixed(0)}s`);
  }
}
await browser.close();

/* never hand a partial sequence to the encoder */
const missing = [];
for (let i = 0; i < total; i++) {
  try { if (fs.statSync(frameAt(i)).size <= 1024) missing.push(i); } catch { missing.push(i); }
}
if (missing.length) {
  log(`INCOMPLETE: ${missing.length} frame(s) missing, first at index ${missing[0]}`);
  log('run the same command again to fill the gaps');
  process.exit(1);
}
const bytes = fs.readdirSync(DIR).reduce((a, n) => a + fs.statSync(path.join(DIR, n)).size, 0);
log(`COMPLETE  ${total} frames in ${DIR}  ${(bytes / 1e9).toFixed(2)} GB  (${((Date.now() - t0) / 1000).toFixed(0)}s this run)`);
