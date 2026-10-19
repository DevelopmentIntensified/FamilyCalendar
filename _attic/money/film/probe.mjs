import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
p.on('pageerror', e => console.error('PAGEERROR:', e.message));
p.on('console', m => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
await p.goto(pathToFileURL(path.join(HERE, 'film.html')).href);
await p.evaluate(() => document.fonts.ready);
await p.evaluate(() => window.setTime(43.5));
console.log(await p.evaluate(() => {
  const g = s => { const e = document.querySelector(s); if (!e) return s + ' MISSING';
    const c = getComputedStyle(e); const r = e.getBoundingClientRect();
    return `${s}\n   opacity=${c.opacity} color=${c.color} bg=${c.backgroundColor} display=${c.display} vis=${c.visibility} filter=${c.filter}\n   rect=${r.x.toFixed(0)},${r.y.toFixed(0)} ${r.width.toFixed(0)}x${r.height.toFixed(0)}`; };
  return ['#s6', '#endcard', '.wm', '.tag', '.url2', '.rule', '.mark', '#stage', ':root'].map(g).join('\n');
}));
await b.close();
