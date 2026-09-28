/**
 * The review system, as a check.
 *
 * review.json claims a review state for every prototype page. This script
 * proves the claim against two things that cannot be talked into agreeing:
 * the directory (does the page exist?) and the collector's own record in
 * feedback/ (was it actually reviewed, and is the round actually closed?).
 *
 * A tree that lies about the filesystem is worse than no tree. Same rule.
 *
 *   node prototypes/review-check.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const SETS = ['calendar-ui', 'app-ui'];
const REGISTRY = join(ROOT, 'review.json');
const FEEDBACK = join(ROOT, 'feedback');

let failures = 0;
const fail = (msg) => {
	failures++;
	console.log(`  FAIL  ${msg}`);
};
const pass = (msg) => console.log(`  ok    ${msg}`);

/** Every prototype page on disk. index.html is a hub, not a prototype. */
function pagesOnDisk() {
	const out = [];
	for (const set of SETS) {
		for (const f of readdirSync(join(ROOT, set))) {
			if (f.endsWith('.html') && f !== 'index.html') out.push(`${set}/${f}`);
		}
	}
	return out.sort();
}

/** feedback/app-ui_tasks.json -> app-ui/tasks.html */
function feedbackFileFor(page) {
	return join(FEEDBACK, page.replace(/\.html$/, '').replace(/\//g, '_') + '.json');
}

/** The collector's record for a page: every mark across every round, deduped. */
function readFeedback(page) {
	const f = feedbackFileFor(page);
	if (!existsSync(f)) return null;
	const j = JSON.parse(readFileSync(f, 'utf8'));
	const byId = new Map();
	for (const it of j.items ?? []) byId.set(it.id, it);
	for (const r of j.rounds ?? []) for (const it of r.items ?? []) byId.set(it.id, it);
	const rounds = j.rounds ?? [];
	return {
		marks: [...byId.values()],
		openRounds: rounds.filter((r) => r.status === 'open').length,
		totalRounds: rounds.length
	};
}

/**
 * Outcome is derived, never asserted: a mark flagged redo is a rebuild; a bad
 * mark that is not is a change request; no bad marks at all is an approval.
 * An empty verdict still counts — a mark left without a verdict is a question
 * the reviewer asked, not a pass.
 */
function deriveOutcome(feedback) {
	if (!feedback || feedback.marks.length === 0) return null;
	if (feedback.marks.some((m) => m.redo === true)) return 'rebuild';
	if (feedback.marks.some((m) => m.verdict === 'bad')) return 'changes-requested';
	return 'approved';
}

console.log('\n§1  every page on disk is in the registry');
const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const entries = registry.pages ?? [];
const byFile = new Map(entries.map((e) => [e.file, e]));
const onDisk = pagesOnDisk();
for (const p of onDisk) {
	if (!byFile.has(p)) fail(`not in review.json: ${p}`);
}
for (const e of entries) {
	if (!existsSync(join(ROOT, e.file))) fail(`registry points at a file that is not on disk: ${e.file}`);
}
if (!failures) pass(`${onDisk.length} pages, all registered, none phantom`);

console.log('\n§2  state matches the marks the collector actually holds');
for (const p of onDisk) {
	const e = byFile.get(p);
	if (!e) continue;
	const fb = readFeedback(p);
	const marked = (fb?.marks.length ?? 0) > 0;
	if (e.state === 'reviewed' && !marked) fail(`${p}: marked reviewed but feedback/ holds no marks`);
	if (e.state === 'unreviewed' && marked) fail(`${p}: marked unreviewed but feedback/ holds marks`);
	if (e.state === 'reviewed' && !e.outcome) fail(`${p}: reviewed with no outcome`);
	if (e.state === 'unreviewed' && e.outcome) fail(`${p}: unreviewed but carries an outcome`);
}
if (!failures) pass('reviewed <-> marks present, on every page');

console.log('\n§3  outcome is the one the marks imply');
for (const p of onDisk) {
	const e = byFile.get(p);
	if (!e || e.state !== 'reviewed') continue;
	const derived = deriveOutcome(readFeedback(p));
	if (e.outcome !== derived) fail(`${p}: says "${e.outcome}", the marks say "${derived}"`);
}
if (!failures) pass('no page claims a verdict its marks do not support');

console.log('\n§4  mark counts match');
for (const p of onDisk) {
	const e = byFile.get(p);
	if (!e || e.marks === undefined) continue;
	const actual = readFeedback(p)?.marks.length ?? 0;
	if (e.marks !== actual) fail(`${p}: says ${e.marks} marks, feedback/ holds ${actual}`);
}
if (!failures) pass('declared mark counts agree with the record');

console.log('\n§5  closure mirrors the collector, never runs ahead of it');
for (const p of onDisk) {
	const e = byFile.get(p);
	if (!e || e.state !== 'reviewed') continue;
	const fb = readFeedback(p);
	if (!fb) continue;
	// The round is the unit of closure. A page is closed when no round is open.
	const actuallyClosed = fb.openRounds === 0;
	if (e.closed === true && !actuallyClosed) {
		fail(`${p}: claims closed, but ${fb.openRounds} round(s) are still open in feedback/`);
	}
	if (e.closed === false && actuallyClosed) {
		fail(`${p}: claims open, but every round is closed — update the registry`);
	}
}
if (!failures) pass('registry closure matches the collector in both directions');

console.log('\n§6  every reviewed page names where its work went');
for (const p of onDisk) {
	const e = byFile.get(p);
	if (!e || e.state !== 'reviewed') continue;
	if (!e.note) fail(`${p}: reviewed with no note — say what the review found`);
	if (e.outcome !== 'approved' && !(e.tickets?.length || e.supersededBy)) {
		fail(`${p}: not approved but names no ticket and no successor`);
	}
}
if (!failures) pass('every reviewed page records its outcome and its destination');

const reviewed = onDisk.filter((p) => byFile.get(p)?.state === 'reviewed');
const counts = { approved: 0, 'changes-requested': 0, rebuild: 0, unreviewed: 0 };
for (const p of onDisk) {
	const e = byFile.get(p);
	counts[e.state === 'unreviewed' ? 'unreviewed' : e.outcome]++;
}
console.log(
	`\n${onDisk.length} prototypes · ${reviewed.length} reviewed (${counts.approved} approved, ${counts['changes-requested']} changes requested, ${counts.rebuild} to rebuild) · ${counts.unreviewed} unreviewed`
);
console.log(failures === 0 ? '\nreview system OK\n' : `\n${failures} failure(s)\n`);
process.exit(failures === 0 ? 0 : 1);
