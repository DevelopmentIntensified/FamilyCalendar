/**
 * Task quick-add NLP — pure, deterministic, client-safe.
 *
 * One field captures the whole task so entry stays fast. Phrases are
 * stripped out of the title as they are consumed:
 *
 *   - Dates:    "tomorrow", "today", "saturday", "next monday",
 *               "in 3 days", "in a week", "next week|month|year",
 *               "jan 5", "feb 14, 2027". Relative/absolute dates land at
 *               the end of the target (local) day; a past month+day rolls
 *               to next year unless an explicit year is given.
 *   - Priority: high/low keywords (word-order tolerant, case-insensitive).
 *   - Assignee: roster-scoped "@sam", "assign to Sam", "for Dad"...
 *   - Recurrence: "every day", "every 2 weeks", "every other month",
 *                 "weekly", "monthly", "yearly/annually", "every saturday"
 *                 (weekly + its next occurrence as the due date).
 *   - Tags:     "#groceries".
 */
import type { TaskPriority } from '$lib/server/db/actions/dashboard';
import type { TaskFrequency } from '$lib/server/db/actions/tasks';

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
	/** `#tag` tokens found in the input (lowercased, deduped). */
	tags: string[];
	/**
	 * Recurrence cadence parsed from the title ("weekly", "monthly", ...),
	 * or null when the title carries no cadence.
	 */
	recurrenceFrequency: TaskFrequency | null;
	/**
	 * Multiplier for the cadence: "every 2 weeks" ⇒ weekly + interval 2.
	 * Null only when recurrenceFrequency is null.
	 */
	recurrenceInterval: number | null;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export const TASK_QUICK_ADD_DATE_RE =
	/\b(today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/i;

export const TASK_QUICK_ADD_PRIORITY_RE =
	/\b(high\s*-?\s*priority|low\s*-?\s*priority|priority\s*[:=]?\s*(high|low)|not\s+urgent|urgent|asap)\b/i;

/** A `#tag` token: `#` followed by word chars and hyphens (e.g. `#groceries`). */
export const TASK_QUICK_ADD_TAG_RE = /#[\p{L}\p{N}_-]+/gu;

const WEEKDAY_TOKEN =
	'(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)';

/** "next friday"/"next mon" — matched whole so "next" isn't left orphaned. */
const TASK_QUICK_ADD_NEXT_WEEKDAY_RE = new RegExp(`\\bnext\\s+(${WEEKDAY_TOKEN})\\b`, 'i');

const MONTH_NAME =
	'(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)';

/** "jan 5", "february 14th", "dec 25, 2027" — month+day, optional year. */
const TASK_QUICK_ADD_MONTH_DATE_RE = new RegExp(
	`\\b${MONTH_NAME}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`,
	'i'
);

/**
 * "in 3 days", "in a week", "next month", "next year" — the "in"/"next"
 * prefix is required so ordinary phrases ("a week", "2 weeks") never
 * become dates by accident. "once a month" is intentionally not matched.
 */
const TASK_QUICK_ADD_RELATIVE_RE =
	/\b(?:in\s+(\d+|a|an)\s+(days?|weeks?|months?|years?)|next\s+(week|month|year))\b/i;

type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';

const FREQ_FROM_UNIT: Record<RecurrenceUnit, TaskFrequency> = {
	day: 'daily',
	week: 'weekly',
	month: 'monthly',
	year: 'yearly'
};

const MONTH_INDEX: Record<string, number> = {
	jan: 0,
	january: 0,
	feb: 1,
	february: 1,
	mar: 2,
	march: 2,
	apr: 3,
	april: 3,
	may: 4,
	jun: 5,
	june: 5,
	jul: 6,
	july: 6,
	aug: 7,
	august: 7,
	sep: 8,
	sept: 8,
	september: 8,
	oct: 9,
	october: 9,
	nov: 10,
	november: 10,
	dec: 11,
	december: 11
};

/** Lowercase, strip the leading `#`, dedupe, and sort raw `#tag` matches. */
export function normalizeQuickAddTags(matches: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const m of matches) {
		const name = m.replace(/^#/, '').toLowerCase().trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		out.push(name);
	}
	return out.sort();
}

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

// ---------------------------------------------------------------------------
// Date + recurrence machinery
// ---------------------------------------------------------------------------

/** The end (23:59 local) of `now`'s calendar day — every parsed date lands here. */
function endOfDayNow(now: Date): Date {
	const t = new Date(now);
	t.setHours(23, 59, 0, 0);
	return t;
}

/** Next occurrence of a weekday token from `now`; today itself rolls to next week. */
function nextWeekdayDate(now: Date, token: string): Date {
	const target = endOfDayNow(now);
	const full = WEEKDAYS.findIndex((d) => d.startsWith(token.toLowerCase().slice(0, 3)));
	if (full === -1) return target;
	let delta = (full - target.getDay() + 7) % 7;
	if (delta === 0) delta = 7;
	target.setDate(target.getDate() + delta);
	return target;
}

function daysInMonth(year: number, month: number): number {
	return new Date(year, month + 1, 0).getDate();
}

/** Add months, clamped to the target month's length ("Jan 31 + 1" ⇒ Feb 28). */
function addMonthsClamped(base: Date, n: number): Date {
	const c = new Date(base);
	const day = c.getDate();
	c.setDate(1);
	c.setMonth(c.getMonth() + n);
	c.setDate(Math.min(day, daysInMonth(c.getFullYear(), c.getMonth())));
	return c;
}

function addYearsClamped(base: Date, n: number): Date {
	const c = new Date(base);
	const day = c.getDate();
	c.setDate(1);
	c.setFullYear(c.getFullYear() + n);
	c.setDate(Math.min(day, daysInMonth(c.getFullYear(), c.getMonth())));
	return c;
}

function shiftDate(base: Date, n: number, unit: RecurrenceUnit): Date {
	if (unit === 'month') return addMonthsClamped(base, n);
	if (unit === 'year') return addYearsClamped(base, n);
	const c = new Date(base);
	if (unit === 'week') c.setDate(c.getDate() + n * 7);
	else c.setDate(c.getDate() + n);
	return c;
}

function monthDayDate(now: Date, month: number, day: number, year: number | null): Date {
	let y = year ?? now.getFullYear();
	if (year === null) {
		const candidate = new Date(y, month, Math.min(day, daysInMonth(y, month)), 23, 59, 0, 0);
		if (candidate.getTime() <= now.getTime()) y += 1;
	}
	const d = Math.min(Math.max(1, day), daysInMonth(y, month));
	return new Date(y, month, d, 23, 59, 0, 0);
}

interface RecurrenceResult {
	frequency: TaskFrequency | null;
	interval: number | null;
	/** Due date implied by the cadence ("every saturday" ⇒ next Saturday), or null. */
	due: Date | null;
	remaining: string;
}

/**
 * Longest phrases first so compound forms ("every other week", "every 3 days")
 * win over the bare words they contain ("week", "day").
 */
const RECURRENCE_STEPS: {
	re: RegExp;
	resolve: (m: RegExpMatchArray, now: Date) => Pick<RecurrenceResult, 'frequency' | 'interval' | 'due'>;
}[] = [
	{
		re: /\bevery other\s+(day|week|month|year)\b/i,
		resolve: (m) => ({
			frequency: FREQ_FROM_UNIT[m[1].toLowerCase() as RecurrenceUnit],
			interval: 2,
			due: null
		})
	},
	{
		re: /\bevery other\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
		resolve: (m, now) => ({ frequency: 'weekly', interval: 2, due: nextWeekdayDate(now, m[1]) })
	},
	{
		re: /\bevery\s+(\d+)\s+(day|week|month|year)s?\b/i,
		resolve: (m) => ({
			frequency: FREQ_FROM_UNIT[m[2].toLowerCase() as RecurrenceUnit],
			interval: Math.max(1, parseInt(m[1], 10)),
			due: null
		})
	},
	{
		re: /\bevery\s+(day|week|month|year)\b/i,
		resolve: (m) => ({
			frequency: FREQ_FROM_UNIT[m[1].toLowerCase() as RecurrenceUnit],
			interval: 1,
			due: null
		})
	},
	{
		re: /\bevery\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
		resolve: (m, now) => ({ frequency: 'weekly', interval: 1, due: nextWeekdayDate(now, m[1]) })
	},
	{
		re: /\b(?:daily|every day)\b/i,
		resolve: () => ({ frequency: 'daily', interval: 1, due: null })
	},
	{
		re: /\bweekly\b/i,
		resolve: () => ({ frequency: 'weekly', interval: 1, due: null })
	},
	{
		re: /\bmonthly\b/i,
		resolve: () => ({ frequency: 'monthly', interval: 1, due: null })
	},
	{
		re: /\b(?:yearly|annually)\b/i,
		resolve: () => ({ frequency: 'yearly', interval: 1, due: null })
	}
];

function parseRecurrence(title: string, now: Date): RecurrenceResult {
	for (const step of RECURRENCE_STEPS) {
		const m = title.match(step.re);
		if (m) {
			const resolved = step.resolve(m, now);
			return { ...resolved, remaining: stripMatch(title, m) };
		}
	}
	return { frequency: null, interval: null, due: null, remaining: title };
}

interface DateResolution {
	due: Date | null;
	match: RegExpMatchArray | null;
}

/**
 * Pick the FIRST date phrase that resolves, in priority order:
 * "next friday" → month+day → "in N units"/"next week|month|year" → bare
 * today/tomorrow/weekday. Returning the match lets callers strip it exactly.
 */
function resolveDateStep(title: string, now: Date): DateResolution {
	const nw = title.match(TASK_QUICK_ADD_NEXT_WEEKDAY_RE);
	if (nw) return { due: nextWeekdayDate(now, nw[1]), match: nw };

	const md = title.match(TASK_QUICK_ADD_MONTH_DATE_RE);
	if (md) {
		const month = MONTH_INDEX[md[1].toLowerCase()];
		const year = md[3] ? parseInt(md[3], 10) : null;
		return { due: monthDayDate(now, month, parseInt(md[2], 10), year), match: md };
	}

	const rel = title.match(TASK_QUICK_ADD_RELATIVE_RE);
	if (rel) {
		if (rel[2]) {
			const amount = rel[1];
			const n = amount === 'a' || amount === 'an' ? 1 : parseInt(amount, 10);
			const unit = rel[2].replace(/s$/, '') as RecurrenceUnit;
			return { due: shiftDate(endOfDayNow(now), n, unit), match: rel };
		}
		const nextUnit = rel[3]?.toLowerCase();
		if (nextUnit) {
			return { due: shiftDate(endOfDayNow(now), 1, nextUnit as RecurrenceUnit), match: rel };
		}
	}

	const bare = title.match(TASK_QUICK_ADD_DATE_RE);
	if (bare) {
		const token = bare[1].toLowerCase();
		if (token === 'today') return { due: endOfDayNow(now), match: bare };
		if (token === 'tomorrow') {
			const t = endOfDayNow(now);
			t.setDate(t.getDate() + 1);
			return { due: t, match: bare };
		}
		return { due: nextWeekdayDate(now, token), match: bare };
	}

	return { due: null, match: null };
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

	// 2. Recurrence cadence, removed from the title. "every saturday" also
	// carries its next occurrence through as the due date.
	let recurrenceFrequency: TaskFrequency | null = null;
	let recurrenceInterval: number | null = null;
	const recurrence = parseRecurrence(title, now);
	if (recurrence.frequency) {
		recurrenceFrequency = recurrence.frequency;
		recurrenceInterval = recurrence.interval;
		title = recurrence.remaining;
	}

	// 3. Natural-language due date, removed from the title
	// ("friday" on a friday = next friday; a passed "jan 5" rolls to next Jan 5).
	let dueDate: string | null = null;
	const resolved = resolveDateStep(title, now);
	if (resolved.match) {
		dueDate = resolved.due!.toISOString();
		title = stripMatch(title, resolved.match);
	} else if (recurrence.due) {
		dueDate = recurrence.due.toISOString();
	}

	// 4. Assignee phrase, removed from the title only when a real roster
	// member matches (deterministic order: priority → cadence → date → assignee).
	let assignedTo: string | null = null;
	if (opts.members && opts.members.length > 0) {
		const match = findTaskAssignee(title, opts.members);
		if (match) {
			assignedTo = match.userId;
			title = title.slice(0, match.index) + title.slice(match.index + match.length);
		}
	}

	// 5. `#tag` tokens, stripped from the title and collected (lowercased).
	const tags = normalizeQuickAddTags(title.match(TASK_QUICK_ADD_TAG_RE) ?? []);
	// The regex is global, so this removes every `#tag` occurrence.
	title = title.replace(TASK_QUICK_ADD_TAG_RE, '');

	title = title.replace(/^[\s:,\-–—;]+/, '').replace(/\s{2,}/g, ' ').trim();
	if (!title) title = raw.trim();

	return { title, dueDate, priority, assignedTo, tags, recurrenceFrequency, recurrenceInterval };
}