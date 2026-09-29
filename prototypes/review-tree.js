/**
 * Review state for a prototype tree page.
 *
 * The per-browser store knows only what THIS browser marked. Two engineers,
 * two different answers about what has been reviewed. review.json is the
 * checked record, so the tree reads that — and falls back to the local store
 * only when the fetch fails (file://).
 *
 * Drop this on any page and call mountReviewState(). It fills, by convention:
 *   [data-review-badge="<set>/<page>.html"]  a node's status slot
 *   [data-review-tallies]                     the hero's counts
 *
 *   import { mountReviewState } from './review-tree.js';
 *   mountReviewState();
 *
 * Also dispatches `proto-review:change` whenever the registry loads or is
 * replaced, so a tree can re-render rows it built before the fetch landed.
 */

const LABEL = {
	approved: 'approved',
	'changes-requested': 'changes requested',
	rebuild: 'to rebuild'
};

let state = new Map();
let loaded = false;

export function reviewState() {
	return state;
}
export function reviewLoaded() {
	return loaded;
}

function badgeFor(file) {
	const r = state.get(file);
	if (!r) return '';
	if (r.state === 'unreviewed') return '<span class="tally t-none">not reviewed</span>';
	if (r.approved) {
		const since = r.approvedAt ? ` · ${String(r.approvedAt).slice(0, 10)}` : '';
		return `<span class="tally t-good" title="approved in the review tool${since}">approved</span>`;
	}
	const label = LABEL[r.outcome] ?? r.state;
	const cls = r.outcome === 'approved' ? 't-good' : r.outcome === 'rebuild' ? 't-bad' : 't-idea';
	const tickets = (r.tickets ?? []).map((t) => `#${t}`).join(' ');
	return (
		`<span class="tally ${cls}" title="review outcome: ${r.outcome}${r.closed ? '' : ' · round still open'}` +
		`${tickets ? ' · ' + tickets : ''}">${label}</span>` +
		(r.closed ? '' : ' <span class="rd" title="the review round is still open">open</span>')
	);
}

function paintBadges() {
	document.querySelectorAll('[data-review-badge]').forEach((slot) => {
		slot.innerHTML = badgeFor(slot.dataset.reviewBadge);
	});
}

function paintTallies(el, total) {
	const reg = [...state.values()];
	const reviewed = reg.filter((r) => r.state === 'reviewed').length;
	const unreviewed = reg.filter((r) => r.state === 'unreviewed').length;
	const approved = reg.filter((r) => r.outcome === 'approved').length;
	const rebuild = reg.filter((r) => r.outcome === 'rebuild').length;
	const byHuman = reg.filter((r) => r.approved).length;
	const pill = (cls, text, title) =>
		text ? `<span class="pill pill-xs ${cls}" title="${title}">${text}</span>` : '';
	el.innerHTML = [
		pill('pill-blush', `${total ?? reg.length} prototypes`, ''),
		pill(reviewed ? 'pill-mint' : 'pill-blush', `${reviewed} reviewed`, 'from review.json'),
		pill('pill-blush', unreviewed ? `${unreviewed} unreviewed` : '', 'never reviewed'),
		pill('pill-mint', approved ? `${approved} approved` : '', 'reviewed, approved — port it'),
		pill('pill-blush', rebuild ? `${rebuild} to rebuild` : '', 'has marks flagged redo'),
		pill('pill-token', byHuman ? `${byHuman} approved in tool` : '', 'approved from the review tool')
	].join('');
}

/**
 * @param {{url?: string, totals?: HTMLElement, total?: number}} opts
 * @returns {Promise<Map<string, object>>} the registry, for callers that want it
 */
export async function mountReviewState(opts = {}) {
	const url = opts.url ?? 'review.json';
	const totals = opts.totals ?? document.querySelector('[data-review-tallies]');
	try {
		const res = await fetch(url, { cache: 'no-store' });
		if (!res.ok) throw new Error(String(res.status));
		const reg = await res.json();
		// Mutate in place, never reassign: a consumer that grabbed the map from
		// reviewState() before this fetch would otherwise hold a stale, empty
		// Map and quietly paint nothing. Reassignment is invisible to callers.
		state.clear();
		for (const p of reg.pages ?? []) state.set(p.file, p);
	} catch (e) {
		/* file:// or offline — the per-browser store still renders */
	}

	/* Approvals come from the REVIEWER'S RECORD, not the registry. The
	   registry only learns a page is approved once it is locked in, so a tree
	   that trusted the registry could never show the bar that performs the
	   lock-in: the bar would depend on the thing it causes. */
	try {
		const res = await fetch('/__feedback', { cache: 'no-store' });
		if (res.ok) {
			const all = await res.json();
			for (const entry of all.pages ?? []) {
				if (!entry?.page || !entry.build?.approved) continue;
				const cur = state.get(entry.page) ?? { file: entry.page, state: 'reviewed' };
				cur.approved = true;
				cur.approvedAt = entry.build.approvedAt ?? null;
				state.set(entry.page, cur);
			}
		}
	} catch (e) {
		/* no collector running: the tree still renders the registry it has */
	}

	loaded = true;
	paintBadges();
	if (totals) paintTallies(totals, opts.total);
	window.dispatchEvent(new CustomEvent('proto-review:change', { detail: state }));
	return state;
}

/** Re-read the registry without a full page load (after a lock-in). */
export async function refreshReviewState(opts = {}) {
	return mountReviewState(opts);
}
