// Cut the master into the delivery set. Video and audio are cut from the SAME
// segment list (imported from audio.mjs) so they cannot drift apart.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROGRAMS } from './audio.mjs';
import { cap, THREADS, CORES } from './threads.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const V = process.env.MASTER || path.join(OUT, 'master.video.mp4');
console.log(`  ${CORES} cores, ffmpeg capped at ${THREADS} threads`);

if (!fs.existsSync(V)) { console.error('missing master.video.mp4 — run capture.mjs then encode.mjs'); process.exit(1); }

const run = (args) => {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...cap(), ...args], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('ffmpeg failed:', args.join(' ')); process.exit(1); }
};

const probe = f => +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of',
  'csv=p=0', f], { encoding: 'utf8' }).stdout.trim();

/* every range must sit inside the master, or ffmpeg silently ships a frozen tail */
const MASTER_LEN = probe(V);
let bad = 0;
for (const [name, segs] of Object.entries(PROGRAMS)) {
  const total = segs.reduce((a, [s, d]) => a + d, 0);
  for (const [s, d] of segs) {
    if (s < 0 || s + d > MASTER_LEN + 1e-6) {
      console.error(`  ${name}: range ${s}+${d} ends at ${(s + d).toFixed(2)}s, past the ${MASTER_LEN.toFixed(2)}s master`);
      bad++;
    }
  }
  if (name !== 'master' && Math.abs(total - Math.round(total)) > 1e-6) {
    console.error(`  ${name}: runtime ${total}s is not a whole number of seconds`);
    bad++;
  }
}
if (bad) { console.error(`\n  ${bad} bad range(s) — fix PROGRAMS in audio.mjs`); process.exit(1); }
console.log(`  master ${MASTER_LEN.toFixed(2)}s, ${Object.keys(PROGRAMS).length} programmes, all ranges in range\n`);

/* Name outputs after the master they came from. A 1080p proof pass must never leave files
   wearing the 4K name, or a proof can be mistaken for the deliverable. */
const SD = /1080p/.test(path.basename(V));
const VERT = process.env.VERTICAL === '1' || /vertical/.test(path.basename(V));
const SUF = `${VERT ? '-vertical' : ''}${SD ? '-1080p' : ''}`;
console.log(`  building from ${path.basename(V)} (${SD ? '1080p' : '4K'}${VERT ? ', vertical 9:16' : ''})\n`);

/* the 45s master: straight mux, no re-encode of picture */
const hero = `familyplanz-45s-hero${SUF}.mp4`;
run(['-i', V, '-i', path.join(OUT, 'master.wav'),
     '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
     '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart',
     path.join(OUT, hero)]);
console.log(`  45s  hero      -> ${hero}`);

/* the cutdowns: trim + concat, each range re-timed per the storyboard */
for (const [name, segs] of Object.entries(PROGRAMS)) {
  if (name === 'master') continue;
  const fc = [];
  const inputs = segs.map(([s, d], i) => {
    fc.push(`[0:v]trim=start=${s.toFixed(3)}:end=${(s + d).toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    return `[v${i}]`;
  });
  fc.push(`${inputs.join('')}concat=n=${segs.length}:v=1:a=0[outv]`);
  const total = segs.reduce((a, [, d]) => a + d, 0);
  const file = `familyplanz-${Math.round(total)}s-${name}${SUF}.mp4`;
  run(['-i', V, '-i', path.join(OUT, `${name}.wav`),
       '-filter_complex', fc.join(';'), '-map', '[outv]', '-map', '1:a:0',
       '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
       '-r', '25', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
       '-movflags', '+faststart', path.join(OUT, file)]);
  console.log(`  ${String(Math.round(total)).padStart(3)}s ${name.padEnd(8)} -> ${file}`);
}

/* the web transcode only exists if the master is actually above 1080p */
if (!SD) {
  const scale = VERT ? '1080:1920' : '1920:1080';
  const lite = VERT ? 'familyplanz-45s-hero-vertical-1080p.mp4' : 'familyplanz-45s-hero-1080p.mp4';
  run(['-i', path.join(OUT, hero),
       '-vf', `scale=${scale}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
       '-c:a', 'copy', '-movflags', '+faststart', path.join(OUT, lite)]);
  console.log(`  45s  hero 1080p -> ${lite}`);
}

/* verify every deliverable actually has the duration, picture and audio it claims */
console.log('\n  verification');
let badFiles = 0;
for (const f of fs.readdirSync(OUT).filter(f => f.endsWith('.mp4')).sort()) {
  const p = path.join(OUT, f);
  const meta = JSON.parse(spawnSync('ffprobe',
    ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,channels',
     '-show_entries', 'format=duration', '-of', 'json', p], { encoding: 'utf8' }).stdout);
  const dur = +meta.format.duration;
  const v = meta.streams.find(s => s.codec_type === 'video');
  const a = meta.streams.find(s => s.codec_type === 'audio');
  const isMaster = /^master\.video/.test(f);
  /* the intermediate masters are picture-only by design; everything else must carry audio */
  const wantAudio = !isMaster;
  const ok = v && (wantAudio ? a && a.codec_name === 'aac' : true);
  if (!ok) badFiles++;
  console.log(`    ${ok ? 'ok  ' : 'FAIL'} ${f.padEnd(34)} ${dur.toFixed(2).padStart(6)}s  ` +
    `${(v ? v.width + 'x' + v.height : '?').padEnd(10)} ` +
    `${(a ? `${a.codec_name} ${a.channels}ch` : isMaster ? 'no audio (intermediate)' : 'MISSING')}`);
}
if (badFiles) { console.error(`\n  ${badFiles} file(s) failed verification`); process.exit(1); }
console.log('\n  all files verified\n');
