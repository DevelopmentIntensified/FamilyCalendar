// Verify the mix without listening to it: short-term RMS in 0.5s buckets,
// so the two intended textures and the hard stop at 8.0 are provable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const f = process.argv[2] || 'master';
const b = fs.readFileSync(path.join(HERE, 'out', `${f}.wav`));
const SR = 48000, off = 44, n = (b.length - off) / 4;
const bucket = Math.round(SR * 0.5);
let bars = [];
for (let s = 0; s + bucket <= n; s += bucket) {
  let acc = 0;
  for (let i = s; i < s + bucket; i++) { const v = b.readInt16LE(off + i * 4) / 32768; acc += v * v; }
  const rms = Math.sqrt(acc / bucket);
  bars.push({ t: (s / SR).toFixed(1), db: 20 * Math.log10(Math.max(rms, 1e-6)) });
}
const max = Math.max(...bars.map(b => b.db));
for (const { t, db } of bars) {
  const n01 = Math.max(0, Math.min(1, (db + 52) / (max + 52)));
  const w = Math.round(n01 * 46);
  console.log(`  ${String(t).padStart(5)}s ${db.toFixed(1).padStart(6)} dB |${'#'.repeat(w).padEnd(46)}|`);
}
const at = t => bars[Math.round(t / 0.5)]?.db ?? NaN;
console.log(`\n  peak bucket ${max.toFixed(1)} dB`);
console.log(`  7.5s  chaos      ${at(7.5).toFixed(1)} dB`);
console.log(`  8.0s  hard stop  ${at(8.0).toFixed(1)} dB  (must drop hard)`);
console.log(`  17.0s silence    ${at(17.0).toFixed(1)} dB`);
console.log(`  19.5s pad in     ${at(19.5).toFixed(1)} dB  (must rise hard)`);
console.log(`  38.0s pad + room ${at(38.0).toFixed(1)} dB`);
console.log(`  44.5s resolve    ${at(44.5).toFixed(1)} dB`);
