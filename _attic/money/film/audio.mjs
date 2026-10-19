// Sound design, synthesised. No samples, no stock audio, nothing to license.
// The mix has exactly two textures: the chaos bed (buzzes + kitchen room tone)
// and the pad that enters on an exact cut at 19.0s. See docs/plans/group-chat-video.md §8.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 48000;
const HERE = path.dirname(fileURLToPath(import.meta.url));

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eo = x => 1 - Math.pow(1 - x, 3);

/* ── deterministic noise ── */
let seed = 0x2f6e2b1;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 2147483648 - 1; };

/* ── the message buzz: two bursts, soft-clipped so it sits slightly wrong ── */
function buzz(t, t0, gain) {
  if (t < t0) return 0;
  const u = t - t0;
  if (u > 0.17) return 0;
  const bursts = [[0.000, 0.052, 604], [0.058, 0.046, 466], [0.112, 0.040, 604]];
  let v = 0;
  for (const [off, dur, f] of bursts) {
    if (u < off || u > off + dur) continue;
    const e = Math.min(1, (u - off) / 0.0035) * Math.exp(-(u - off) / (dur * 0.34));
    const p = 2 * Math.PI * f * (u - off);
    v += e * (Math.sin(p) * 0.72 + Math.sin(p * 2.003) * 0.19 + Math.sin(p * 0.997) * 0.14);
  }
  v = Math.tanh(v * 1.45) * 0.62;          // the "slightly too compressed" part
  return v * gain;
}

/* ── the pad: five warm voices, slow independent swells, no movement ── */
const PAD = [
  { f: 55.00, g: 0.30, lfo: 0.041, d: -4 },
  { f: 110.00, g: 0.42, lfo: 0.053, d: +3 },
  { f: 164.81, g: 0.30, lfo: 0.067, d: -5 },
  { f: 220.00, g: 0.21, lfo: 0.079, d: +4 },
  { f: 277.18, g: 0.13, lfo: 0.091, d: -3 },
  { f: 329.63, g: 0.07, lfo: 0.103, d: +5 },
];
function pad(t) {
  if (t < 19.0) return 0;
  const u = t - 19.0;
  const atk = Math.min(1, u / 1.35);
  const rel = 1 - eo(seg(t, 44.25, 44.95));
  const env = atk * rel * 0.32;
  if (env <= 0) return 0;
  let v = 0;
  for (const p of PAD) {
    const det = Math.pow(2, p.d / 1200);
    const sw = 1 + 0.16 * Math.sin(2 * Math.PI * p.lfo * t) + 0.07 * Math.sin(2 * Math.PI * p.lfo * 2.7 * t + 1.1);
    v += p.g * sw * (Math.sin(2 * Math.PI * p.f * t) * 0.62 + Math.sin(2 * Math.PI * p.f * det * t) * 0.38);
  }
  return v * env;
}

/* ── the three soft clicks as the three events land ── */
const CLICKS = [19.05, 19.49, 19.93];
function click(t) {
  let v = 0;
  for (const c of CLICKS) {
    if (t < c) continue;
    const u = t - c;
    if (u > 0.05) continue;
    v += Math.exp(-u / 0.011) * (Math.sin(2 * Math.PI * 2380 * u) * 0.55 + rnd() * Math.exp(-u / 0.0016) * 0.4);
  }
  return v * 0.055;
}

/* ── room tone: kitchen when the phone is on, thin air at the desk ── */
let lpA = 0, lpB = 0, lpC = 0;
const onepole = (x, fc) => { const a = 1 - Math.exp(-2 * Math.PI * fc / SR); lpA += a * (x - lpA); return lpA; };
function room(t, i) {
  const kitchen = seg(t, -0.2, 0.9) * (1 - seg(t, 14.55, 15.1)) * (1 - seg(t, 30.7, 31.6)) * (1 - seg(t, 41.4, 42.1));
  const desk = seg(t, 14.2, 15.0) * (1 - seg(t, 30.6, 31.4)) * 0.34;
  const lvl = kitchen * 0.052 + desk * 0.030;
  if (lvl <= 0) return 0;
  const n = rnd();
  lpB = onepole(n, 260);                        // fridge hum
  const air = n - lpA * 0.0;                    // (lpA is advanced below)
  return ((lpB * 2.4) + air * 0.16) * lvl;
}

/* ── the buzz schedule (mirrors BUZZ in film.html) ── */
const BUZZ = [0.4,1.2,1.55,1.8,2.25,2.55,2.8,3.05,3.3,3.5,3.7,3.9,4.1,4.3,4.5,4.7,4.9,5.1,5.3,5.5,5.7,5.9,6.1,6.3,6.5,6.7,6.9,7.1,7.3,7.5,7.7];
const SOFT = 32.55;   // "got it" — the last sound of the chaos

/* the master mix, as a pure function of time */
function mix(t) {
  let v = room(t);
  for (const b of BUZZ) v += buzz(t, b, 0.30 * (1 - 0.35 * seg(b, 0, 7.7)));   // they pile up, then compress
  v += buzz(t, SOFT, 0.17);
  v += pad(t) + click(t);
  return v;
}

/* ── programme: a list of master-time ranges, concatenated in order.
     Every range must lie inside the 45s master, and a cutdown's ranges must sum to its runtime. ── */
export const PROGRAMS = {
  master:  [[0, 45]],
  bumper6: [[15.0, 2.0], [19.0, 2.0], [42.0, 2.0]],
  cut15:   [[9.2, 2.5], [14.9, 2.5], [19.0, 3.0], [24.5, 4.0], [42.0, 3.0]],
  cut30:   [[8.8, 5.2], [14.0, 1.0], [15.0, 4.0], [19.0, 5.0], [24.0, 6.7], [31.9, 5.1], [42.0, 3.0]],
};

function render(programName, outPath) {
  const prog = PROGRAMS[programName];
  const total = prog.reduce((a, [s, d]) => a + d, 0);
  const N = Math.round(total * SR);
  const L = new Float32Array(N), R = new Float32Array(N);

  // place each segment, with 10ms equal-power joins so hard cuts don't click
  let o = 0;
  for (const [src, dur] of prog) {
    const n = Math.round(dur * SR);
    for (let i = 0; i < n; i++) {
      const g = Math.min(1, i / (SR * 0.010), (n - i) / (SR * 0.010));
      const w = g * g * (3 - 2 * g);
      const v = mix(src + i / SR) * w;
      L[o + i] += v; R[o + i] += v * 0.97;
    }
    o += n;
  }

  // gentle soft-knee limiter, then normalise to a broadcast-ish ceiling
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const norm = peak > 0 ? 0.89 / peak : 1;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    let l = L[i] * norm, r = R[i] * norm;
    l = l < -0.7 ? -0.7 - Math.tanh(-(l + 0.7)) * 0.19 : l > 0.7 ? 0.7 + Math.tanh(l - 0.7) * 0.19 : l;
    r = r < -0.7 ? -0.7 - Math.tanh(-(r + 0.7)) * 0.19 : r > 0.7 ? 0.7 + Math.tanh(r - 0.7) * 0.19 : r;
    L[i] = l; R[i] = r; sum += l * l + r * r;
  }
  const rms = Math.sqrt(sum / (2 * N));
  console.log(`  ${programName.padEnd(8)} ${total.toFixed(2)}s  peak ${(20 * Math.log10(peak * norm)).toFixed(1)} dBFS   rms ${(20 * Math.log10(rms)).toFixed(1)} dBFS`);

  // 16-bit stereo WAV
  const b = Buffer.alloc(44 + N * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + N * 4, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, b);
}

const which = process.argv[2] || 'all';
if (which === 'all') for (const k of Object.keys(PROGRAMS)) render(k, path.join(HERE, 'out', `${k}.wav`));
else render(which, path.join(HERE, 'out', `${which}.wav`));
