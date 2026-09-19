// Shared harness for /extract-test/* method pages. No deps, no DOM at top
// level (import-safe in node for quick checks).

export const SAMPLE = [
	'Buy milk tomorrow',
	'Dentist next Friday at 3pm',
	'Pay rent Sept 1',
	'Call mom in 3 days',
	'Team retro Monday',
	'Submit expense report 2026-09-30',
	'Book flights Dec 25, 2026',
	'Discussion Topic'
].join('\n');

/** One task per line; strips bullets / numbered-list markers. */
export function splitPasteList(raw) {
	return raw
		.split(/\r?\n+/)
		.map((s) => s.replace(/^[\s•\-\*›]+/, '').replace(/^\d+[.)\]]\s*/, '').trim())
		.filter(Boolean);
}

const CANVAS_TYPE = /^(assignment|quiz|discussion topic)$/i;
const CANVAS_SECTION = /^(overdue|upcoming|past)\s+assignments$/i;
const CANVAS_DUE = /^due\s+/i;
const CANVAS_SCORE = /(?:\d+\s*\/\s*)?\d+\s*pts/i;

/**
 * Canvas/LMS dumps are multi-line records (type, title, "Due …", score)
 * not one-task-per-line. Auto-detects on /^Due / lines and joins each
 * record into a single text the engines can parse; otherwise falls back
 * to plain line splitting. Returns [{ text, tag }].
 */
export function splitRecords(raw) {
	const lines = raw
		.split(/\r?\n+/)
		.map((s) => s.replace(/^[\s•\-\*›]+/, '').replace(/^\d+[.)\]]\s*/, '').trim())
		.filter(Boolean);
	if (!lines.some((l) => CANVAS_DUE.test(l))) {
		return splitPasteList(raw).map((t) => ({ text: t, tag: '' }));
	}
	const out = [];
	const year = new Date().getFullYear();
	let title = [],
		type = '',
		section = '';
	const flush = (dueText) => {
		if (!title.length && !dueText) return;
		// Pin the academic-term year: "Due Sep 10" means this year's Sep 10
		// (overdue included), never a rollover to next year.
		dueText = dueText.replace(
			/(due\s+[a-z]+\s+\d{1,2}(?:st|nd|rd|th)?)(?!\s*\d{4})/i,
			`$1 ${year}`
		);
		out.push({
			text: [...title, dueText].filter(Boolean).join(' '),
			tag: [section === 'past' ? 'past' : '', type].filter(Boolean).join(' · '),
			clean: true
		});
		title = [];
		type = '';
	};
	for (const line of lines) {
		if (CANVAS_SECTION.test(line)) {
			section = line.split(/\s/)[0].toLowerCase();
			continue;
		}
		if (CANVAS_TYPE.test(line)) {
			type = line;
			continue;
		}
		if (CANVAS_SCORE.test(line)) continue;
		if (CANVAS_DUE.test(line)) {
			flush(line);
			continue;
		}
		title.push(line);
	}
	if (title.length) out.push({ text: title.join(' '), tag: type });
	return out;
}

const MONTHS = {
	january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
	may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
	september: 8, sept: 8, sep: 8, october: 9, oct: 9, november: 10, nov: 10,
	december: 11, dec: 11
};
const WDS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MON_RE =
	'january|february|march|april|may|june|july|august|september|october|november|december|sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec';

const addDays = (d, n) => {
	const c = new Date(d);
	c.setDate(c.getDate() + n);
	return c;
};
const startOfDay = (d) => {
	const c = new Date(d);
	c.setHours(0, 0, 0, 0);
	return c;
};
const deltaTo = (wd, from) => {
	const d = (WDS.indexOf(wd) - from + 7) % 7;
	return d === 0 ? 7 : d;
};

/**
 * Minimal date finder (mirrors taskQuickAdd priorities).
 * Returns { date: Date, index, length } or null.
 */
export function parseDateRegex(line, now = new Date()) {
	let m;
	if ((m = line.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i))) {
		return { date: addDays(now, deltaTo(m[1].toLowerCase(), now.getDay()) + 7), index: m.index, length: m[0].length };
	}
	if ((m = line.match(new RegExp(`\\b(${MON_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, 'i')))) {
		const mi = MONTHS[m[1].toLowerCase()];
		const day = Math.min(parseInt(m[2], 10), 28);
		let y = m[3] ? parseInt(m[3], 10) : now.getFullYear();
		let d = new Date(y, mi, day);
		if (!m[3] && d < startOfDay(now)) d = new Date(y + 1, mi, day);
		return { date: d, index: m.index, length: m[0].length };
	}
	if ((m = line.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/))) {
		return { date: new Date(+m[1], +m[2] - 1, +m[3]), index: m.index, length: m[0].length };
	}
	if ((m = line.match(/\bin\s+(\d+|a|an)\s+(days?|weeks?|months?|years?)\b/i))) {
		const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : 1;
		const u = m[2].toLowerCase();
		const d = new Date(now);
		if (u.startsWith('day')) d.setDate(d.getDate() + n);
		else if (u.startsWith('week')) d.setDate(d.getDate() + n * 7);
		else if (u.startsWith('month')) d.setMonth(d.getMonth() + n);
		else d.setFullYear(d.getFullYear() + n);
		return { date: d, index: m.index, length: m[0].length };
	}
	if ((m = line.match(/\btoday\b/i))) return { date: new Date(now), index: m.index, length: m[0].length };
	if ((m = line.match(/\btomorrow\b/i))) return { date: addDays(now, 1), index: m.index, length: m[0].length };
	if ((m = line.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i))) {
		return { date: addDays(now, deltaTo(m[1].toLowerCase(), now.getDay())), index: m.index, length: m[0].length };
	}
	return null;
}

/** Remove a matched span; fall back to the raw line when nothing remains. */
export function stripMatch(line, hit) {
	if (!hit) return line.trim();
	const t = (line.slice(0, hit.index) + line.slice(hit.index + hit.length))
		.replace(/\s{2,}/g, ' ')
		.replace(/^[\s:,\-]+/, '')
		.trim();
	return t || line.trim();
}

export function fmtLocal(d) {
	if (!d || isNaN(d)) return '';
	const p = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function escapeHtml(s) {
	return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Device gate for the on-device model pass: needs cores + RAM.
 *  Unknown values (browser hides them) count as OK — the model load
 *  itself is the final arbiter, failures just fall back to fast-only. */
export function deviceOK() {
	const cores = navigator.hardwareConcurrency || 0;
	const mem = navigator.deviceMemory || 0;
	if (cores && cores < 4) return false;
	if (mem && mem < 4) return false;
	return true;
}

/** Wire textarea + button + table. run(lines) → [{ title, due, note }].
 *  Live: evaluates on input (debounced) and once on load — typing gives
 *  instant feedback, button is the explicit fallback.
 *  verify(lines) — optional background double-check (e.g. on-device NER).
 *  Skipped when the device gate fails. Patches apply only if no newer
 *  keystroke started (stale-run guard via runId). */
export function wire(run, opts = {}) {
	const { debounceMs = 250, verify = null } = opts;
	const ta = document.getElementById('in');
	const go = document.getElementById('go');
	const out = document.getElementById('out');
	const ms = document.getElementById('ms');
	let status = document.getElementById('status');
	if (!status) {
		status = document.createElement('span');
		status.id = 'status';
		status.className = 'badge';
		ms.after(status);
	}
	ta.value = SAMPLE;
	let busy = false;
	let pending = false;
	let runId = 0;
	const paint = (rows) => {
		out.innerHTML = rows
			.map(
				(r) =>
					`<tr><td>${escapeHtml(r.title)}</td><td class="due">${escapeHtml(r.due || '—')}</td><td class="note">${escapeHtml(r.note || '')}</td></tr>`
			)
			.join('');
	};
	async function evaluate() {
		if (busy) {
			pending = true;
			return;
		}
		busy = true;
		const myRun = ++runId;
		go.disabled = true;
		out.classList.add('updating');
		const t0 = performance.now();
		try {
			const recs = splitRecords(ta.value);
			const rows = await run(recs.map((r) => r.text));
			rows.forEach((row, i) => {
				if (recs[i].tag) row.note = recs[i].tag + (row.note ? ' · ' + row.note : '');
				// Canvas leftovers the date match doesn't consume ("Due", "at 11:59pm").
				if (recs[i].clean) {
					row.title = row.title
						.replace(/\bdue\b/gi, '')
						.replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(am|pm)\b/gi, '')
						.replace(/\s{2,}/g, ' ')
						.trim();
				}
			});
			if (myRun !== runId) return; // superseded by newer keystrokes
			paint(rows);
			ms.textContent = `${((performance.now() - t0) / 1000).toFixed(1)}s · ${rows.length} lines`;
			if (verify) {
				if (!deviceOK()) {
				status.textContent = 'fast only — device too small for on-device check';
				status.className = 'badge off';
			} else {
				status.textContent = 'verifying on-device…';
				status.className = 'badge';
				try {
					const patches = await verify(recs.map((r) => r.text));
					if (myRun !== runId) return;
					let upgraded = 0;
					patches.forEach((p, i) => {
						if (p && p.better) {
							if (p.title) rows[i].title = p.title;
							rows[i].note = (rows[i].note ? rows[i].note + ' · ' : '') + (p.note || 'model ✓');
							upgraded++;
						}
					});
					paint(rows);
					status.textContent = upgraded ? `model verified · ${upgraded} upgraded` : 'model verified · fast answers stand';
					status.className = 'badge on';
				} catch {
					if (myRun !== runId) return;
					status.textContent = 'fast only — model check failed';
					status.className = 'badge off';
				}
			}
			}
		} catch (e) {
			if (myRun !== runId) return;
			out.innerHTML = `<tr><td colspan="3">error: ${escapeHtml(String((e && e.message) || e))}</td></tr>`;
		} finally {
			out.classList.remove('updating');
		}
		busy = false;
		go.disabled = false;
		if (pending) {
			pending = false;
			evaluate();
		}
	}
	go.addEventListener('click', evaluate);
	let t = null;
	ta.addEventListener('input', () => {
		clearTimeout(t);
		t = setTimeout(evaluate, debounceMs);
	});
	evaluate(); // prefill on load
}
