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

/** A family roster member the quick-add can be pointed at. */
export interface TaskQuickAddMember {
	userId: string;
	firstName: string;
	lastName: string;
}

export interface TaskQuickAddOptions {
	/** Base clock for relative dates; defaults to the real current time. */
	now?: Date;
	/**
	 * Family roster. When given, an assignee phrase ("for Dad", "@mom",
	 * "assign to Sam"...) is stripped from the title and returned as
	 * `assignedTo`. Matching is roster-scoped, so bare "for"/"to" words
	 * are harmless unless a real member name follows.
	 */
	members?: TaskQuickAddMember[];
}

export interface TaskQuickAddResult {
	title: string;
	/** ISO timestamp at end-of-target-day, or null when no date keyword. */
	dueDate: string | null;
	priority: TaskPriority;
	/** Matched roster member's userId, or null when no assignee phrase found. */
	assignedTo: string | null;
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

/**
 * The assignee phrase matched in a quick-add input (including the
 * trigger word), so callers can slice it back out of the title.
 */
export interface TaskAssigneeMatch {
	userId: string;
	/** Index where the matched phrase (trigger + name) starts. */
	index: number;
	/** Length of the matched phrase, including the leading trigger. */
	length: number;
}

/**
 * Trigger words that may precede a roster member's name. `assign to`
 * must precede `assign` so the longer phrase wins at the same spot.
 */
const ASSIGNEE_TRIGGERS = ['@', 'assign to', 'assign', 'task', 'for', 'to'] as const;

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assigneePhraseRe(trigger: string, name: string): RegExp {
	const esc = escapeRegExp(name);
	// Name must be a whole word: not glued to a longer word ("Sam" ≠ "Sammy").
	const boundary = '(?=$|\\s|[^\\w])';
	if (trigger === '@') {
		return new RegExp(`(^|\\s)@\\s*${esc}${boundary}`, 'i');
	}
	return new RegExp(`(^|\\s)${trigger}\\s+${esc}${boundary}`, 'i');
}

/**
 * Find the best roster-matched assignee phrase in an input string.
 * Returns the earliest occurrence, breaking ties toward the longest
 * phrase (so "First Last" beats a bare first name at the same spot).
 * Roster-scoped: no match ⇒ null, and nothing should be stripped.
 */
export function findTaskAssignee(
	input: string,
	members: TaskQuickAddMember[]
): TaskAssigneeMatch | null {
	let best: TaskAssigneeMatch | null = null;
	for (const trigger of ASSIGNEE_TRIGGERS) {
		for (const member of members) {
			const variants = [
				member.firstName && member.lastName ? `${member.firstName} ${member.lastName}` : '',
				member.firstName,
				member.lastName
			].filter((v): v is string => v.length > 0);
			for (const name of new Set(variants)) {
				const match = assigneePhraseRe(trigger, name).exec(input);
				if (!match || match.index === undefined) continue;
				const candidate = { userId: member.userId, index: match.index, length: match[0].length };
				if (
					!best ||
					candidate.index < best.index ||
					(candidate.index === best.index && candidate.length > best.length)
				) {
					best = candidate;
				}
			}
		}
	}
	return best;
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

	// 3. Assignee phrase, removed from the title only when a real roster
	// member matches (deterministic order: priority → date → assignee).
	let assignedTo: string | null = null;
	if (opts.members && opts.members.length > 0) {
		const match = findTaskAssignee(title, opts.members);
		if (match) {
			assignedTo = match.userId;
			title = title.slice(0, match.index) + title.slice(match.index + match.length);
		}
	}

	title = title.replace(/^[\s:,\-–—;]+/, '').replace(/\s{2,}/g, ' ').trim();
	if (!title) title = raw.trim();

	return { title, dueDate, priority, assignedTo };
}