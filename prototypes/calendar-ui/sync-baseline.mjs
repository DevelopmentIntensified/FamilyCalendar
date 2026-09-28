/* Regenerates 0-current.html's inline EV/TASK literals from proto-data.js so
   the baseline and the prototypes render byte-identical data. Run after any
   change to proto-data's mock set:
     node prototypes/calendar-ui/sync-baseline.mjs                                        */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { CALENDARS, buildEvents, TASKS } = await import(pathToFileURL(join(here, 'proto-data.js')).href);
void CALENDARS;

const evs = buildEvents(2026, 9);
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

// id order must be stable so picked-set behaviour is deterministic
const evLines = evs.map((e, i) => {
	const parts = [`day:${e.day}`, `start:${q(e.start)}`, `dur:${e.durMin}`, `title:${q(e.title)}`, `cal:${q(e.cal)}`];
	parts.push(`id:${q('e' + (i + 1))}`);
	if (e.rsvp) parts.push(`rsvp:${q(e.rsvp)}`);
	if (e.isAd) parts.push('isAd:1');
	if (e.attendance) parts.push(`att:{g:${e.attendance.going},i:${e.attendance.invited}}`);
	return ` {${parts.join(',')}}`;
});

const taskLines = TASKS.map((t, i) =>
	` {id:${q('t' + (i + 1))},day:${t.day},title:${q(t.title)},over:${t.overdue ? 1 : 0}}`
);

const block = `const EV=[\n${evLines.join(',\n')}\n];
const TASK=[\n${taskLines.join(',\n')}\n];`;

const file = join(here, '0-current.html');
const src = readFileSync(file, 'utf8');
const start = src.indexOf('const EV=[');
const end = src.indexOf('];', src.indexOf('const TASK=[')) + 2;
if (start === -1 || end < start) {
	console.error('could not locate the EV/TASK block in 0-current.html');
	process.exit(1);
}
writeFileSync(file, src.slice(0, start) + block + src.slice(end), 'utf8');
console.log(`synced ${evs.length} events + ${TASKS.length} tasks into 0-current.html`);
