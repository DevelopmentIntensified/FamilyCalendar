/**
 * Task quick-add NLP — pure, deterministic, client-safe.
 *
 * Quick-add markup like "buy milk tomorrow", "clean gutters saturday" and
 * "high priority file taxes" is parsed in one field so capture stays fast.
 * Relative dates land at the end of the target (local) day.
 *
 * Priority keywords (word-order tolerant, case-insensitive):
 *   high  — "high priority", "high-priority", "priority: high", "priority high",
 *           "urgent", "asap"
 *   low   — "low priority", "low-priority", "priority: low", "priority low",
 *           "not urgent"
 * Anything else stays 'normal'. No keyword ⇒ 'normal'.
 */
import type { TaskPriority } from '$lib/server/db/actions/dashboard';

export interface TaskQuickAddOptions {
	/** Base clock for relative dates; defaults to the real current time. */
	now?: Date;
}

export interface TaskQuickAddResult {
	title: string;
	/** ISO timestamp at end-of-target-day, or null when no date keyword. */
	dueDate: string | null;
	priority: TaskPriority;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export const TASK_QUICK_ADD_DATE_RE =
	/\b(today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/i;

export const TASK_QUICK_ADD_PRIORITY_RE =
	/\b(high\s*-?\s*priority|low\s*-?\s*priority|priority\s*[:=]?\s*(high|low)|not\s+urgent|urgent|asap)\b/i;

/** Strip a matched keyword/phrase out of the original string at its position. */
function stripMatch(input: string, match: RegExpMatchArray): string {
	const at = match.index!;
	return input.slice(0, at) + input.slice(at + match[0].length);
}

export function parseTaskQuickAdd(raw: string, opts: TaskQuickAddOptions = {}): TaskQuickAddResult {
	const now = opts.now ?? new Date();
	let title = raw.trim();

	// 1. Priority keyword, removed from the title.
	let priority: TaskPriority = 'normal';
	const pm = title.match(TASK_QUICK_ADD_PRIORITY_RE);
	if (pm) {
		priority = /(low|not\s+urgent)/.test(pm[0].toLowerCase()) ? 'low' : 'high';
		title = stripMatch(title, pm);
	}

	// 2. Relative due date, removed from the title ("friday" on a friday = next friday).
	let dueDate: string | null = null;
	const dm = title.match(TASK_QUICK_ADD_DATE_RE);
	if (dm) {
		const token = dm[1].toLowerCase();
		const target = new Date(now);
		target.setHours(23, 59, 0, 0);
		let dueFound = false;
		if (token === 'tomorrow') {
			target.setDate(target.getDate() + 1);
			dueFound = true;
		} else if (token === 'today') {
			dueFound = true;
		} else {
			const full = WEEKDAYS.findIndex((d) => d.startsWith(token.slice(0, 3)));
			if (full !== -1) {
				let delta = (full - target.getDay() + 7) % 7;
				if (delta === 0) delta = 7;
				target.setDate(target.getDate() + delta);
				dueFound = true;
			}
		}
		if (dueFound) {
			dueDate = target.toISOString();
			title = stripMatch(title, dm);
		}
	}

	title = title.replace(/^[\s:,\-–—;]+/, '').replace(/\s{2,}/g, ' ').trim();
	if (!title) title = raw.trim();

	return { title, dueDate, priority };
}