// Grab individual frames for review. usage: node stills.mjs 0.5 3 11 16 20 26 33 39 43
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DSF = +(process.env.DSF || 1);
const VERT = process.env.VERTICAL === '1';
const times = process.argv.slice(2).map(Number);
const VW = VERT ? 1080 : 1920, VH = VERT ? 1920 : 1080;
const dir = path.join(HERE, 'out', 'stills');
fs.mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DSF });
const page = await ctx.newPage();
page.on('pageerror', e => console.error('  PAGE ERROR:', e.message));
await page.goto(pathToFileURL(path.join(HERE, 'film.html')).href + (VERT ? '?vertical=1' : ''));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(250);
for (const t of times) {
  await page.evaluate(tt => window.setTime(tt), t);
  const f = `${VERT ? 'v' : 't'}${String(t).padStart(5, '0').replace('.', '_')}.png`;
  await page.screenshot({ path: path.join(dir, f) });
  console.log('  ' + f);
}
await browser.close();
