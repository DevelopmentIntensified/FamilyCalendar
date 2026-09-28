/* The invariant that matters most: a client that only knows about its CURRENT
   round must never erase the rounds it does not know about. That is exactly
   what a cleared localStorage, a second machine, or an old reload looks like.
   Run: node prototypes/calendar-ui/rounds-e2e.mjs                                */
import { readFile, rm, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL = 'C:/Users/MIRP/.agents/skills/prototype/assets/feedback';

/* This suite DELETES the output directory it works against, so it must never
   point at the collector you are actually reviewing in — that directory holds
   real marks. So it spawns its own throwaway collector on a spare port with its
   own out dir, and tears it down afterwards. Hermetic, and no hardcoded port:
   nothing to remember, nothing to keep alive, nothing to break when the shared
   collector moves. */
const PORT = Number(process.env.FB_PORT || 4311);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = join(tmpdir(), 'fb-rounds-e2e-' + process.pid);
const SET = 'calendar-ui';
const PAGE = `${SET}/b-focus-sidebar.html`;

let bad = 0;
const fail = (m) => { bad++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const post = async (body) => {
	const r = await fetch(ORIGIN + '/__feedback', {
		method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
	});
	const j = await r.json();
	if (!j.ok) throw new Error(j.error || ('HTTP ' + r.status));
	return j;
};
const get = async (page) => (await fetch(ORIGIN + '/__feedback?page=' + encodeURIComponent(page))).json();

const ABOUT = { id: 'b', label: 'Prototype B · Focus Sidebar', family: 'calendar-ui', question: 'Rail or toolbar?' };
const SEL = '[data-fb="rail-members"] > div.rail__title';
const mark = (over) => ({ id: 'm', selector: SEL, region: '[data-fb="rail-members"]', regionLabel: 'Rail · whose plans', tag: 'div', classes: ['rail__title'], box: { w: 251, h: 14 }, ...over });

console.log(`\n── throwaway collector on ${PORT} ──`);
const server = spawn(process.execPath,
	[join(SKILL, 'collector.mjs'), '--root', join(here, '..'), '--port', String(PORT), '--out', OUT],
	{ stdio: 'ignore' });
const cleanup = async () => {
	try { server.kill(); } catch (e) { /* already gone */ }
	await rm(OUT, { recursive: true, force: true });
};
process.on('exit', () => { try { server.kill(); } catch (e) { /* ignore */ } });

// wait for it to answer, rather than sleeping and hoping
let up = false;
for (let i = 0; i < 40 && !up; i++) {
	await sleep(150);
	try {
		const r = await fetch(ORIGIN + '/__feedback');
		if (r.ok) up = true;
	} catch (e) { /* not yet */ }
}
if (!up) {
	console.error(`collector did not come up on ${PORT}`);
	await cleanup();
	process.exit(2);
}
ok(`collector up, writing to a temp dir (not the shared one)`);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

console.log('\n── round 1 is recorded and closed ──');
let r = await post({
	page: PAGE, about: ABOUT, viewport: '1440x900',
	rounds: [{
		id: 'r1', status: 'closed', page: PAGE,
		openedAt: '2026-09-25T10:00:00Z', closedAt: '2026-09-25T10:30:00Z',
		outcome: 'renamed to "By person"',
		items: [mark({ verdict: 'bad', note: 'awkward wording', redo: true })]
	}]
});
if (r.rounds !== 1) fail(`expected 1 round, got ${r.rounds}`);
// round 1 is closed, so there is nothing in the OPEN bucket
else if (r.items !== 0) fail(`a closed round should not count as open: got ${r.items}`);
else if (r.openRounds !== 0) fail(`expected 0 open rounds, got ${r.openRounds}`);
else ok(`round 1 stored and closed: ${r.rounds} round, ${r.items} open items, ${r.openRounds} open rounds`);

console.log('\n── a client that only knows round 2 must not erase round 1 ──');
r = await post({
	page: PAGE, about: ABOUT, viewport: '1440x900',
	rounds: [{
		id: 'r2', status: 'open', page: PAGE, openedAt: '2026-09-25T11:00:00Z',
		items: [mark({ id: 'm2', verdict: 'good', note: 'reads much better now', text: 'BY PERSON' })]
	}]
});
if (r.rounds !== 2) fail(`collector dropped history: ${r.rounds} round(s), expected 2`);
else ok(`collector kept both rounds: ${r.rounds}`);

let rec = await get(PAGE);
if (rec.rounds.length !== 2) fail(`file has ${rec.rounds.length} rounds, expected 2`);
else {
	const [a, b] = rec.rounds;
	if (a.id !== 'r1' || b.id !== 'r2') fail(`rounds out of order: ${rec.rounds.map((x) => x.id).join(',')}`);
	else if (a.status !== 'closed') fail('round 1 lost its closed status');
	else if (a.outcome !== 'renamed to "By person"') fail(`round 1 lost its outcome: ${a.outcome}`);
	else if (a.items[0].note !== 'awkward wording') fail('round 1 lost its note');
	else if (b.items[0].note !== 'reads much better now') fail('round 2 note wrong');
	else ok('both rounds on disk, in order, with their notes and outcomes intact');
}

console.log('\n── the carry-over is surfaced: same selector, bad → good ──');
const sameSelector = rec.rounds[0].items[0].selector === rec.rounds[1].items[0].selector;
if (!sameSelector) fail('the two rounds are not comparable — selector drifted');

const { execFileSync } = await import('node:child_process');
const out = execFileSync(process.execPath, [join(SKILL, 'read.mjs'), '--out', OUT], { encoding: 'utf8' });
if (!/Round 1/.test(out) || !/Round 2/.test(out)) fail('read.mjs does not show both rounds');
else if (!/carried over from an earlier round/.test(out)) fail('read.mjs does not flag the carry-over');
else if (!/bad→good/.test(out)) fail('read.mjs does not show the verdict transition');
else if (!/Outcome:\*\* renamed to/.test(out)) fail('read.mjs does not show the outcome');
else ok('read.mjs shows the sequence, the outcome, and bad→good as a landed fix');
console.log('\n' + out.split('\n').slice(0, 22).map((l) => '    ' + l).join('\n'));

console.log('\n── a v1 client (flat items) lands in the open round, not a new one ──');
r = await post({ page: PAGE, about: ABOUT, items: [mark({ id: 'legacy', verdict: 'idea', note: 'from an old client' })] });
if (r.rounds !== 2) fail(`a v1 payload should not invent a round: got ${r.rounds}`);
else ok(`v1 payload accepted: still ${r.rounds} rounds, history intact`);
rec = await get(PAGE);
if (rec.rounds[0].note !== undefined && rec.rounds[0].items.some((i) => i.id === 'legacy')) {
	fail('the v1 write landed in a closed round');
} else if (!rec.rounds[1].items.some((i) => i.id === 'legacy')) {
	fail('the v1 write did not land in the open round');
} else ok('the v1 write went into the open round, leaving both earlier rounds alone');

console.log('\n── an empty POST cannot remove history ──');
r = await post({ page: PAGE, about: ABOUT, rounds: [] });
rec = await get(PAGE);
if (rec.rounds.length !== 2) fail(`an empty-rounds POST changed history: ${rec.rounds.length} rounds left`);
else ok('an empty POST leaves every round alone — only an explicit Clear removes them');

console.log(bad ? `\n${bad} problems` : '\nclean');
void sleep;
await cleanup();
process.exit(bad ? 1 : 0);
