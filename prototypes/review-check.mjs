#!/usr/bin/env node
/**
 * The review system, as a check.
 *
 * A project claims a review state for every prototype page. This proves the
 * claim against two things that cannot be talked into agreeing: the directory
 * (does the page exist?) and the reviewer's own record (was it actually
 * reviewed, and is the round actually closed?).
 *
 * A tree that lies about the filesystem is worse than no tree. Same rule.
 *
 *   node review-check.mjs [--root <prototype dir>] [--quiet]
 *
 * Zero configuration: pages are discovered from the directory. A project with
 * more than one set (app/, calendar-ui/, …) may declare them in review.json's
 * optional "sets" map, but nothing here knows any project's directory names.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const argOf = (flag) => {
	const i = argv.indexOf(flag);
	return i !== -1 ? argv[i + 1] : null;
};

// resolve(), not join(cwd, …): an absolute --root must not be glued onto cwd.
const ROOT = resolve(argOf('--root') ?? fileURLToPath(new URL('.', import.meta.url)));
const QUIET = argv.includes('--quiet');
const REGISTRY = join(ROOT, 'review.json');
const FEEDBACK = join(ROOT, 'feedback');

let failures = 0;
const fail = (msg) => {
	failures++;
	console.log(`  FAIL  ${msg}`);
};
const ok = (msg) => !QUIET && console.log(`  ok    ${msg}`);
const section = (n, title) => !QUIET && console.log(`\n§${n}  ${title}`);

if (!existsSync(REGISTRY)) {
	console.log(`\nno review.json in ${ROOT} — nothing to check`);
	console.log('  copy review.json.example and register your pages\n');
	process.exit(0);
}

const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const entries = registry.pages ?? [];
const byFile = new Map(entries.map((e) => [e.file, e]));

/** Subdirectories that hold prototypes. Declared in the registry, else found. */
function setDirs() {
	if (registry.sets && Object.keys(registry.sets).length) return Object.keys(registry.sets);
	return readdirSync(ROOT)
		.filter((e) => statSync(join(ROOT, e)).isDirectory())
		.filter((e) => {
			try {
				return readdirSync(join(ROOT, e)).some((f) => f.endsWith('.html'));
			} catch {
				return false;
			}
		});
}

/** Every prototype page, discovered rather than listed. */
function pagesOnDisk() {
	const out = [];
	for (const set of setDirs()) {
		const dir = join(ROOT, set);
		if (!existsSync(dir)) continue;
		for (const f of readdirSync(dir)) {
			// index.html is a set hub, not a prototype. Same rule everywhere.
			if (f.endsWith('.html') && f !== 'index.html') out.push(`${set}/${f}`);
		}
	}
	return out.sort();
}

/** feedback/app-ui_tasks.json -> app-ui/tasks.html */
function feedbackFileFor(page) {
	return join(FEEDBACK, page.replace(/\.html$/, '').replace(/\//g, '_') + '.json');
}

/** The record for a page: every mark across every round, deduped. */
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
		totalRounds: rounds.length,
		approved: j.build?.approved === true,
		approvedAt: j.build?.approvedAt
	};
}

/**
 * The outcome is derived, never asserted: a mark flagged redo is a rebuild; a
 * bad mark that is not is a change request; no bad marks at all is an
 * approval. An empty verdict still counts — a mark left without a verdict is
 * a question the reviewer asked, not a pass.
 */
function deriveOutcome(feedback) {
	if (!feedback || feedback.marks.length === 0) return null;
	if (feedback.marks.some((m) => m.redo === true)) return 'rebuild';
	if (feedback.marks.some((m) => m.verdict === 'bad')) return 'changes-requested';
	return 'approved';
}

const onDisk = pagesOnDisk();

section(1, 'every page on disk is in the registry');
for (const p of onDisk) if (!byFile.has(p)) fail(`not in review.json: ${p}`);
for (const e of entries) {
	if (!existsSync(join(ROOT, ...e.file.split('/')))) {
		fail(`registry points at a file that is not on disk: ${e.file}`);
	}
}
if (!failures) ok(`${onDisk.length} pages, all registered, none phantom`);

section(2, 'state matches the marks that were actually made');
for (const p of onDisk) {
	const e = byFile.get(p);
	if (!e) continue;
	const marked = (readFeedback(p)?.marks.length ?? 0) > 0;
	if (e.state === 'reviewed' && !marked) fail(`${p}: marked reviewed but no marks exist`);
	if (e.state === 'unreviewed' && marked) fail(`${p}: marked unreviewed but marks exist`);
	if (e.state === 'reviewed' && !e.outcome) fail(`${p}: reviewed with no outcome`);
	if (e.state === 'unreviewed' && e.outcome) fail(`${p}: unreviewed but carries an outcome`);
}
if (!failures) ok('reviewed <-> marks present, on every page');

section(3, 'outcome is the one the marks imply');
for (const p of onDisk) {
	const e = byFile.get(p);
	if (!e || e.state !== 'reviewed') continue;
	const derived = deriveOutcome(readFeedback(p));
	if (e.outcome !== derived) fail(`${p}: says "${e.outcome}", the marks say "${derived}"`);
}
if (!failures) ok('no page claims a verdict its marks do not support');

section(4, 'mark counts match');
for (const p of onDisk) {
	const e = byFile.get(p);
	if (!e || e.marks === undefined) continue;
	const actual = readFeedback(p)?.marks.length ?? 0;
	if (e.marks !== actual) fail(`${p}: says ${e.marks} marks, the record holds ${actual}`);
}
if (!failures) ok('declared mark counts agree with the record');

section(5, 'closure mirrors the reviewer, never runs ahead of it');
for (const p of onDisk) {
	const e = byFile.get(p);
	if (!e || e.state !== 'reviewed') continue;
	const fb = readFeedback(p);
	if (!fb) continue;
	// Approval is the reviewer's, recorded by the collector in the page's own
	// record. The registry mirrors it; it never asserts it. Without this the
	// tree can show nine approved pages the registry has never heard of, and
	// nothing notices until someone counts.
	const approved = fb.approved === true;
	if (e.approved === true && !approved) {
		fail(`${p}: registry claims approved, the review record does not`);
	}
	if (e.approved !== true && approved) {
		fail(`${p}: approved in the review tool, registry does not say so`);
	}
	// The round is the unit of closure: a page is closed when no round is open.
	const actuallyClosed = fb.openRounds === 0;
	if (e.closed === true && !actuallyClosed) {
		fail(`${p}: claims closed, but ${fb.openRounds} round(s) are still open`);
	}
	if (e.closed === false && actuallyClosed) {
		fail(`${p}: claims open, but every round is closed — update review.json`);
	}
}
if (!failures) ok('registry closure matches the record in both directions');

section(6, 'every reviewed page says where its work went');
for (const p of onDisk) {
	const e = byFile.get(p);
	if (!e || e.state !== 'reviewed') continue;
	if (!e.note) fail(`${p}: reviewed with no note — say what the review found`);
	if (e.outcome !== 'approved' && !(e.tickets?.length || e.supersededBy)) {
		fail(`${p}: not approved but names no ticket and no successor`);
	}
}
if (!failures) ok('every reviewed page records its outcome and its destination');

const counts = { approved: 0, 'changes-requested': 0, rebuild: 0, unreviewed: 0, approvedByHuman: 0 };
for (const p of onDisk) {
	const e = byFile.get(p);
	if (!e) continue;
	if (e.state === 'unreviewed') counts.unreviewed++;
	else counts[e.outcome] = (counts[e.outcome] ?? 0) + 1;
	if (e.approved) counts.approvedByHuman++;
}
if (!QUIET) {
	// Counted from the REGISTRY, not from onDisk minus unreviewed: a page that
	// is not registered is not "reviewed", it is unregistered, and folding it
	// into the total is how a drifted registry still looks tidy.
	const reg = entries.filter((e) => existsSync(join(ROOT, ...e.file.split('/'))));
	const reviewed = reg.filter((r) => r.state === 'reviewed').length;
	const unregistered = onDisk.length - reg.length;
	console.log(
		`\n${onDisk.length} prototypes · ${reviewed} reviewed (${counts.approved} approved, ` +
			`${counts['changes-requested']} changes requested, ${counts.rebuild} to rebuild) · ` +
			`${counts.unreviewed} unreviewed` +
			(unregistered ? ` · ${unregistered} unregistered (see §1)` : '') +
			(counts.approvedByHuman ? ` · ${counts.approvedByHuman} approved in the review tool` : '')
	);
}
console.log(failures === 0 ? '\nreview system OK\n' : `\n${failures} failure(s)\n`);
process.exit(failures === 0 ? 0 : 1);
