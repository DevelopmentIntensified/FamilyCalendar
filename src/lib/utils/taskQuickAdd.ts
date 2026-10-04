/**
 * Task quick-add NLP — pure, deterministic, client-safe.
 *
 * One field captures the whole task so entry stays fast. Phrases are
 * stripped out of the title as they are consumed:
 *
 *   - Dates:    "tomorrow", "today", "saturday", "next monday",
 *               "in 3 days", "in a week", "next week|month|year",
 *               "jan 5", "feb 14, 2027". Relative/absolute dates land at
 *               the end of the target (local) day; the YEAR a bare month+day
 *               belongs to is `resolveMonthDay`'s call (issue 114).
 *   - Priority: high/low keywords (word-order tolerant, case-insensitive).
 *   - Assignee: roster-scoped "@sam", "assign to Sam", "for Dad"...
 *   - Recurrence: every cadence phrase in the SHARED table — "every day",
 *                 "every 2 weeks", "every other month", "quarterly",
 *                 "weekly", "monthly", "yearly/annually" — plus this
 *                 parser's weekday anchor, "every saturday" (weekly + its
 *                 next occurrence as the due date), which carries a date.
 *   - Tags:     "#groceries".
 *
 * Client-safe ON PURPOSE: no server-action imports. The cadence and date
 * RULES live in `dateResolution.ts` (shared with the event and bill parsers);
 * this file keeps only the quick-add specifics — the weekday anchor, the
 * end-of-day landing time, the roster. Before issue 114 it reached into
 * `$lib/server/db/actions/` for its types because there was no shared layer
 * to import; that is gone.
 */
import {
	MONTH_INDEX_0,
	MONTH_NAME_TOKEN,
	WEEKDAY_FULL,
	WEEKDAY_SHORT,
	WEEKDAY_TOKEN,
	escapeRegExp
} from '$lib/utils/dateVocab';
import {
	cadenceFrequency,
	daysInMonth,
	daysUntilWeekday,
	matchCadence,
	resolveMonthDay,
	type CadenceFrequency,
	type CalendarDate
} from '$lib/utils/dateResolution';
import type { TaskPriority } from '$lib/utils/priorityTone';

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
	recurrenceFrequency: CadenceFrequency | null;
	/**
	 * Multiplier for the cadence: "every 2 weeks" ⇒ weekly + interval 2.
	 * Null only when recurrenceFrequency is null.
	 */
	recurrenceInterval: number | null;
	/**
	 * Task scoping (issue 019): `#public`/`#private` tags set this; new
	 * tasks default to 'public', so the bare result is always valid.
	 */
	visibility: 'public' | 'private';
	/** True when an explicit #public/#private tag was present in the input. */
	visibilityExplicit: boolean;
	/** True when an `@family` marker was present — the task belongs to the family. */
	familyTask: boolean;
	/**
	 * An `@name` handle that did NOT uniquely match a roster member
	 * ("@zoe" unknown, or ambiguous between two members). Rendered with
	 * its `@` so the UI can show an inline error instead of silently
	 * dropping the assignment. Null when every handle resolved.
	 */
	unknownMember: string | null;
}

// Full weekday names for weekday arithmetic (Sunday = 0, matching Date.getDay()).
// Shared vocabulary lives in `dateVocab.ts`; WEEKDAY_FULL is the source of truth.
const WEEKDAYS = WEEKDAY_FULL;

export const TASK_QUICK_ADD_DATE_RE = new RegExp(
	`\\b(today|tomorrow|${WEEKDAY_FULL.concat(WEEKDAY_SHORT).join('|')})\\b`,
	'i'
);

export const TASK_QUICK_ADD_PRIORITY_RE =
	/\b(high\s*-?\s*priority|low\s*-?\s*priority|priority\s*[:=]?\s*(high|low)|not\s+urgent|urgent|asap)\b/i;

/** A `#tag` token: `#` followed by word chars and hyphens (e.g. `#groceries`). */
export const TASK_QUICK_ADD_TAG_RE = /#[\p{L}\p{N}_-]+/gu;

/**
 * Task scoping (issue 019): `#public` / `#private` set the visibility.
 * `\b` keeps longer tags like `#privates` out of the match, so they stay
 * ordinary content tags.
 */
export const TASK_QUICK_ADD_VISIBILITY_TAG_RE = /#(public|private)\b/gi;

/** An `@handle` token: `@` followed by word chars (e.g. `@maya`, `@family`). */
export const TASK_QUICK_ADD_AT_TOKEN_RE = /@([\p{L}\p{N}_-]+)/gu;

/** "next friday"/"next mon" — matched whole so "next" isn't left orphaned. */
const TASK_QUICK_ADD_NEXT_WEEKDAY_RE = new RegExp(`\\bnext\\s+(${WEEKDAY_TOKEN})\\b`, 'i');

/** "jan 5", "february 14th", "dec 25, 2027" — month+day, optional year. */
const TASK_QUICK_ADD_MONTH_DATE_RE = new RegExp(
	`\\b(?:due\\s+)?${MONTH_NAME_TOKEN}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`,
	'i'
);

/** Clock times Canvas/LMS dump after a due date — only stripped when a date matched. */
const TASK_QUICK_ADD_CLOCK_RE = /\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi;

/**
 * "in 3 days", "in a week", "next month", "next year" — the "in"/"next"
 * prefix is required so ordinary phrases ("a week", "2 weeks") never
 * become dates by accident. "once a month" is intentionally not matched.
 */
const TASK_QUICK_ADD_RELATIVE_RE =
	/\b(?:in\s+(\d+|a|an)\s+(days?|weeks?|months?|years?)|next\s+(week|month|year))\b/i;

type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';

/** 0-based month name/abbreviation → index (shared vocabulary). */
const MONTH_INDEX = MONTH_INDEX_0;

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
	target.setDate(target.getDate() + daysUntilWeekday(target.getDay(), full));
	return target;
}

/** Days in a 0-based month, the way `Date.getMonth()` counts them. */
function daysIn0Month(year: number, month0: number): number {
	return daysInMonth(year, month0 + 1);
}

/** Add months, clamped to the target month's length ("Jan 31 + 1" ⇒ Feb 28). */
function addMonthsClamped(base: Date, n: number): Date {
	const c = new Date(base);
	const day = c.getDate();
	c.setDate(1);
	c.setMonth(c.getMonth() + n);
	c.setDate(Math.min(day, daysIn0Month(c.getFullYear(), c.getMonth())));
	return c;
}

function addYearsClamped(base: Date, n: number): Date {
	const c = new Date(base);
	const day = c.getDate();
	c.setDate(1);
	c.setFullYear(c.getFullYear() + n);
	c.setDate(Math.min(day, daysIn0Month(c.getFullYear(), c.getMonth())));
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

/**
 * A month+day phrase → the local `Date` the shared rollover rule picked,
 * landing at the end of that day. `month` is 1-based, the shape the shared
 * rule takes; THIS rule (which year a bare "sept 1" belongs to) is its call.
 */
function monthDayDate(now: Date, month: number, day: number, year: number | null): Date {
	const today: CalendarDate = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
	const resolved = resolveMonthDay(today, month, day, year);
	if (!resolved) return endOfDayNow(now);
	return new Date(resolved.year, resolved.month - 1, resolved.day, 23, 59, 0, 0);
}

interface RecurrenceResult {
	frequency: CadenceFrequency | null;
	interval: number | null;
	/** Due date implied by the cadence ("every saturday" ⇒ next Saturday), or null. */
	due: Date | null;
	remaining: string;
}

/** Weekday alternation for the quick-add's own anchor ("every saturday"). */
const TASK_QUICK_ADD_DAY_ALT = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday';

/**
 * A weekday-anchored cadence: "every saturday" ⇒ weekly + that day's next
 * occurrence. It carries a DATE, so it cannot live in the shared cadence
 * table — but the interval and the frequency word come from the shared
 * cadence so "every other saturday" is biweekly here too.
 */
const TASK_QUICK_ADD_EVERY_OTHER_DAY_RE = new RegExp(`\\bevery\\s+other\\s+(${TASK_QUICK_ADD_DAY_ALT})\\b`, 'i');
const TASK_QUICK_ADD_EVERY_DAY_RE = new RegExp(`\\bevery\\s+(${TASK_QUICK_ADD_DAY_ALT})\\b`, 'i');

function weekdayAnchor(title: string, re: RegExp, now: Date, every: number): RecurrenceResult | null {
	const m = title.match(re);
	if (!m) return null;
	const cadence = { unit: 'week' as const, every };
	return {
		frequency: cadenceFrequency(cadence),
		interval: cadence.every,
		due: nextWeekdayDate(now, m[1]),
		remaining: stripMatch(title, m)
	};
}

/**
 * Cadence resolution: the weekday anchors first (they carry a date), then
 * the SHARED cadence table, which every parser reads. A phrase is added
 * there once and it lands here, in the event parser and in bills.
 */
function parseRecurrence(title: string, now: Date): RecurrenceResult {
	return (
		weekdayAnchor(title, TASK_QUICK_ADD_EVERY_OTHER_DAY_RE, now, 2) ??
		weekdayAnchor(title, TASK_QUICK_ADD_EVERY_DAY_RE, now, 1) ??
		sharedCadence(title) ?? { frequency: null, interval: null, due: null, remaining: title }
	);
}

/** The shared cadence table's answer for a title, as quick-add's two fields. */
function sharedCadence(title: string): RecurrenceResult | null {
	const hit = matchCadence(title);
	if (!hit) return null;
	return {
		frequency: cadenceFrequency(hit.cadence),
		interval: hit.cadence.every,
		due: null,
		remaining: stripMatch(title, hit.match)
	};
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
		// MONTH_INDEX is 0-based; the shared rule takes 1-based months.
		const month = MONTH_INDEX[md[1].toLowerCase()] + 1;
		const year = md[3] ? parseInt(md[3], 10) : null;
		return { due: monthDayDate(now, month, parseInt(md[2], 10), year), match: md };
	}

	const rel = title.match(TASK_QUICK_ADD_RELATIVE_RE);
	if (rel) {
		if (rel[2]) {
			const amount = rel[1];
			const n = amount === 'a' || amount === 'an' ? 1 : parseInt(amount, 10);
			// SAFETY: TASK_QUICK_ADD_RELATIVE_RE only captures
			// (days?|weeks?|months?|years?), so stripping the plural `s` yields
			// exactly a RecurrenceUnit word.
			const unit = rel[2].replace(/s$/, '') as RecurrenceUnit;
			return { due: shiftDate(endOfDayNow(now), n, unit), match: rel };
		}
		const nextUnit = rel[3]?.toLowerCase();
		if (nextUnit) {
			// SAFETY: the `next` branch of TASK_QUICK_ADD_RELATIVE_RE only
			// captures week|month|year, so nextUnit is always a RecurrenceUnit.
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

// ---------------------------------------------------------------------------
// Task scoping: @family / @name handles (issue 019)
// ---------------------------------------------------------------------------

/** A resolved `@handle`: whose task it becomes, and how much text it ate. */
interface AtHandleMatch {
	/**
	 * Matched member's userId, or null when the longest match is ambiguous
	 * between members (caller surfaces unknownMember instead of assigning).
	 */
	userId: string | null;
	/** Consumed text length, from the `@` through the end of the name. */
	length: number;
}

/**
 * Roster match for an `@handle` at `match.index` in `title` (issue 024).
 * Each member contributes candidate names — firstName alone (which may be
 * MULTI-WORD, e.g. "Mary Ann"), lastName alone, and "First Last" — and a
 * candidate may consume as many following words as it needs. The greedy
 * longest match wins; if two DIFFERENT members tie at that longest length
 * the result is ambiguous (`userId: null`) so the caller surfaces
 * "unknown member" instead of guessing. No candidate matches (unknown
 * name) → null too.
 */
function matchAtHandle(
	title: string,
	match: RegExpExecArray,
	members: TaskQuickAddMember[]
): AtHandleMatch | null {
	const rest = title.slice(match.index);
	const hits: (AtHandleMatch & { userId: string | null })[] = [];
	for (const m of members) {
		const candidates = new Set(
			[`${m.firstName} ${m.lastName}`.trim(), m.firstName, m.lastName]
				.filter((v) => v.length > 0)
				.map((v) => v.toLowerCase())
		);
		for (const candidate of candidates) {
			const re = new RegExp(`^@\\s*${escapeRegExp(candidate)}(?=$|\\s|[^\\w])`, 'i');
			const cm = re.exec(rest);
			if (cm) hits.push({ userId: m.userId, length: cm[0].length });
		}
	}
	if (hits.length === 0) return null;
	const longest = Math.max(...hits.map((h) => h.length));
	const winners = new Set(hits.filter((h) => h.length === longest).map((h) => h.userId));
	return winners.size === 1
		? { userId: [...winners][0], length: longest }
		: // Ambiguous: still report how much text the tie consumed so the
			// caller cuts all of it (no stray middle name left in the title).
			{ userId: null, length: longest };
}

/** Strip every `[at, at+len)` cut from the string, right-to-left. */
function stripCuts(input: string, cuts: { at: number; len: number }[]): string {
	let out = input;
	for (let i = cuts.length - 1; i >= 0; i -= 1) {
		out = out.slice(0, cuts[i].at) + out.slice(cuts[i].at + cuts[i].len);
	}
	return out;
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
	let recurrenceFrequency: CadenceFrequency | null = null;
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
		title = stripMatch(title, resolved.match)
			.replace(TASK_QUICK_ADD_CLOCK_RE, '')
			.replace(/\bdue\b/gi, '');
	} else if (recurrence.due) {
		dueDate = recurrence.due.toISOString();
	}

	// 3.5 Task scoping (issue 019): `#public`/`#private` tags set the
	// visibility and `@family`/`@name` handles set the target — each is
	// stripped from the title. Runs BEFORE the generic assignee pass so a
	// resolved `@handle` wins over later "for Dad" phrasing.
	let visibility: 'public' | 'private' = 'public';
	let visibilityExplicit = false;
	let familyTask = false;
	let unknownMember: string | null = null;
	let sawAtToken = false;

	const visibilityMatches = [...title.matchAll(TASK_QUICK_ADD_VISIBILITY_TAG_RE)];
	if (visibilityMatches.length > 0) {
		visibilityExplicit = true;
		// SAFETY: TASK_QUICK_ADD_VISIBILITY_TAG_RE only captures public|private.
		visibility = visibilityMatches[visibilityMatches.length - 1][1].toLowerCase() as
			| 'public'
			| 'private';
		title = stripCuts(
			title,
			visibilityMatches.map((vm) => ({ at: vm.index!, len: vm[0].length }))
		);
	}

	// 4. Assignee phrase, removed from the title only when a real roster
	// member matches (deterministic order: priority → cadence → date →
	// scoping → assignee).
	let assignedTo: string | null = null;
	if (opts.members && opts.members.length > 0) {
		const ats = [...title.matchAll(TASK_QUICK_ADD_AT_TOKEN_RE)];
		sawAtToken = ats.length > 0;
		const cuts: { at: number; len: number }[] = [];
		for (const am of ats) {
			const token = am[1];
			if (token.toLowerCase() === 'family') {
				familyTask = true;
				cuts.push({ at: am.index!, len: am[0].length });
				continue;
			}
			const hit = matchAtHandle(title, am, opts.members);
			if (hit?.userId) {
				assignedTo = hit.userId;
				cuts.push({ at: am.index!, len: hit.length });
			} else {
				// Unknown or ambiguous member: never silently dropped — the
				// UI surfaces this as an inline error instead. Cut what the
				// failed lookup consumed (the candidate length when a name
				// partially matched, else just the token) so no stray name
				// fragment is left in the title.
				unknownMember = `@${token}`;
				cuts.push({ at: am.index!, len: hit?.length ?? am[0].length });
			}
		}
		title = stripCuts(title, cuts);
	}

	if (!sawAtToken && opts.members && opts.members.length > 0) {
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

	title = title
		.replace(/^[\s:,\-–—;]+/, '')
		.replace(/\s{2,}/g, ' ')
		.trim();
	if (!title) title = raw.trim();

	return {
		title,
		dueDate,
		priority,
		assignedTo,
		tags,
		recurrenceFrequency,
		recurrenceInterval,
		visibility,
		visibilityExplicit,
		familyTask,
		unknownMember
	};
}
