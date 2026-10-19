// Stage 2 of 3: frames -> master.video.mp4. Separate from capture so the picture can be
// re-encoded (different CRF, preset, resolution) without re-rendering an hour of frames.
//   RES=2 reads frames-2160   RES=1 reads frames-1080
//   VERTICAL=1 reads frames-vertical-* and writes master.video-vertical[-1080p].mp4
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cap, THREADS, CORES } from './threads.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const RES = +(process.env.RES || 2);
const VERT = process.env.VERTICAL === '1';
const DIR = path.join(OUT, VERT ? `frames-vertical-${RES === 2 ? '2160' : '1080'}` : `frames-${RES === 2 ? '2160' : '1080'}`);
const FPS = 25;

if (!fs.existsSync(DIR)) { console.error(`missing ${DIR} — run capture.mjs first`); process.exit(1); }
const frames = fs.readdirSync(DIR).filter(f => f.endsWith('.png')).sort();
const expected = Math.round(45 * FPS);
if (frames.length !== expected) {
  console.error(`${DIR} has ${frames.length} frames, expected ${expected} — re-run capture.mjs to fill the gaps`);
  process.exit(1);
}

const out = path.join(OUT, VERT ? `master.video-vertical${RES === 2 ? '' : '-1080p'}.mp4` : `master.video${RES === 2 ? '' : '-1080p'}.mp4`);
console.log(`  encoding ${frames.length} frames @${FPS}fps  ${CORES} cores, ${THREADS} threads  ->  ${path.basename(out)}`);

const r = spawnSync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error', '-stats',
  ...cap(), '-framerate', String(FPS), '-i', path.join(DIR, '%05d.png'),
  '-an', ...cap(), '-c:v', 'libx264', '-preset', 'medium', '-crf', '15',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out,
], { stdio: ['ignore', 'inherit', 'inherit'] });
if (r.status !== 0) { console.error('encode failed'); process.exit(1); }
console.log(`  done  ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
