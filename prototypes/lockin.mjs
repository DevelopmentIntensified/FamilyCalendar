/**
 * Lock-in hook for THIS project.
 *
 * The collector calls this when someone presses "lock in" on the prototype
 * tree. A browser cannot write files, so this is the only place a click
 * reaches a filesystem. It lives in the project, not in the skill, because
 * the skill has no idea what an issue tracker is called, how tickets are
 * numbered, or what one looks like here. That vocabulary is ours.
 *
 * Two rules, both learned the hard way:
 *   1. IDEMPOTENT — pressing the button twice must not create two tickets.
 *   2. SAY WHAT YOU DID — the return value is shown to the user verbatim, and
 *      a button that silently does nothing is worse than no button.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..'); // prototypes/ -> repo root
const REGISTRY = join(HERE, 'review.json');
const ISSUES = join(REPO, 'docs', 'issues');

/** Highest NNN- already in docs/issues, so a new ticket continues the series. */
function nextIssueNumber() {
	let max = 0;
	for (const f of readdirSync(ISSUES)) {
		const m = /^(\d{3})-/.exec(f);
		if (m) max = Math.max(max, Number(m[1]));
	}
	return String(max + 1).padStart(3, '0');
}

/** Filesystem-safe slug from the page name. */
function slugFor(page) {
	return page
		.replace(/\.html$/, '')
		.split('/')
		.join('-')
		.replace(/[^a-z0-9-]+/gi, '-')
		.replace(/-+/g, '-')
		.toLowerCase();
}

/** Has this page already been locked in? Idempotence, by search not memory. */
function existingTicketFor(page) {
	const slug = slugFor(page);
	const hit = readdirSync(ISSUES).find((f) => f.includes(slug));
	return hit ? join(ISSUES, hit) : null;
}

export async function lockin(payload) {
	const { page, build, items = [] } = payload ?? {};
	if (!page) return { created: [], message: 'nothing to lock in' };
	if (!build?.approved) {
		return { created: [], message: `${page} is not approved — approve it first` };
	}

	/* The page's own record knows what it is (its #fb-page identity) and what
	   was marked on it. The tree button does not have to carry either. */
	let about = {};
	let marks = items;
	let record = null;
	const rec = join(HERE, 'feedback', page.replace(/\.html$/, '').replace(/\//g, '_') + '.json');
	if (existsSync(rec)) {
		record = JSON.parse(readFileSync(rec, 'utf8'));
		about = record.about ?? {};
		const byId = new Map();
		for (const it of record.items ?? []) byId.set(it.id, it);
		for (const r of record.rounds ?? []) for (const it of r.items ?? []) byId.set(it.id, it);
		if (byId.size) marks = [...byId.values()];
	}

	/* Do NOT trust the payload's claim that this is approved. A browser can
	   post anything, and this writes files. The record on disk is the truth —
	   the same rule the whole review system runs on. */
	if (!record?.build?.approved) {
		return {
			created: [],
			message: `${page} is not recorded as approved — the click asked for it, but the record says otherwise`
		};
	}

	/* ---------------------------------------------------- 1. the registry */
	const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
	const entry = reg.pages.find((p) => p.file === page);
	if (!entry) {
		return { created: [], message: `${page} is not in review.json — register it first` };
	}
	entry.approved = true;
	entry.approvedAt = build.approvedAt || new Date().toISOString();
	if (entry.state === 'unreviewed') {
		entry.state = 'reviewed';
		entry.outcome = entry.outcome || 'approved';
	}

	/* ------------------------------------------------------ 2. the ticket */
	const existing = existingTicketFor(page);
	if (existing) {
		// Already raised. Re-affirm the approval, create nothing.
		entry.tickets = entry.tickets?.length ? entry.tickets : [existing.split(/[/\\]/).pop().slice(0, 3)];
		writeFileSync(REGISTRY, JSON.stringify(reg, null, '\t') + '\n', 'utf8');
		return {
			created: [],
			registry: 'review.json',
			message: `Already locked in as ${existing.split(/[/\\]/).pop()} — no second ticket raised.`
		};
	}

	const n = nextIssueNumber();
	const bad = marks.filter((i) => i.verdict === 'bad');
	const title = about.label || page;
	const body = [
		`# ${n} — ${title}: port the approved prototype to the app`,
		'',
		'Status: open',
		'',
		`Source: \`${page}\`, approved for building in the review tool on ${String(entry.approvedAt).slice(0, 10)}.`,
		'',
		about.question ? `> **Question:** ${about.question}` : null,
		about.thesis ? `> **Approach:** ${about.thesis}` : null,
		about.realPage ? `> **Real route:** ${about.realPage}` : null,
		'',
		'**Blocked by:** None (can start immediately).',
		'',
		'## Needs doing',
		'',
		'- [ ] Port this prototype to the real route, keeping the structure it reproduces',
		'- [ ] Port the raised findings, each as its own acceptance criterion:',
		...marks.map((m) => `  - [ ] ${m.verdict === 'bad' ? '**fix**' : m.verdict === 'good' ? '**keep**' : 'consider:'} ${(m.note || m.text || m.selector).replace(/\s+/g, ' ').slice(0, 160)}`),
		'- [ ] The prototype keeps reproducing the app rather than the app keeping the prototype',
		'',
		'## Done',
		'',
		'## Notes',
		'',
		`- Raised by the prototype tree's lock-in button, not by hand.`,
		bad.length ? `- ${bad.length} mark(s) were flagged bad at approval time.` : '- Approved with no bad marks.'
	]
		.filter((l) => l !== null)
		.join('\n');

	const file = join(ISSUES, `${n}-${slugFor(page)}.md`);
	writeFileSync(file, body + '\n', 'utf8');
	entry.tickets = [...(entry.tickets ?? []), n];
	writeFileSync(REGISTRY, JSON.stringify(reg, null, '\t') + '\n', 'utf8');

	return {
		created: [file],
		registry: 'review.json',
		ticket: `${n}`,
		message: `Locked in: ${n} raised, and ${page} recorded as approved in review.json.`
	};
}
