/**
 * parsing task quick-add — the Task grammar (legacy `src/lib/utils/taskQuickAdd.ts`).
 *
 * One field captures the whole task. The title is stripped in a fixed order:
 * priority → cadence → due date → `#public`/`#private` and `@handle` scoping →
 * generic assignee → `#tags` → whitespace; an emptied title falls back to the
 * raw input.
 *
 * Client-safe on purpose: it imports vocabulary, the cadence rules and
 * `kernel/time` — never the event parser and never `compromise`. Due dates
 * land at 23:59 in the CALLER'S zone, so the resolution runs through Luxon
 * with the zone the caller passes; it never reads a clock (R5) and never
 * touches the host timezone.
 */
import { DateTime, IANAZone } from 'luxon';
import type { CalendarDate, RecurrenceFrequency } from '$lib/kernel/time/dates';
import { daysUntilWeekday, resolveMonthDay } from '$lib/kernel/time/dates';
import {
	DAY_ALT,
	MONTH_INDEX_0,
	MONTH_NAME_TOKEN,
	WEEKDAY_FULL,
	WEEKDAY_SHORT,
	WEEKDAY_TOKEN,
	escapeRegExp
} from './parsing.vocabulary.rules';
import { cadenceFrequency, matchCadence } from './parsing.dates.rules';

/** The parsed quick-add priority; tasks maps it to its tone. */
export type QuickAddPriority = 'high' | 'normal' | 'low';

/** A family roster member the quick-add can be pointed at. */
export interface TaskQuickAddMember {
	userId: string;
	firstName: string;
	lastName: string;
}

/** Inputs the Task grammar resolves against. */
export interface TaskQuickAddOptions {
	/** Base clock for relative dates (R5). */
	now: Date;
	/** The IANA zone every due date lands at 23:59 in — required, never the host's. */
	zone: string;
	/**
	 * Family roster. When given, an assignee phrase ("for Dad", "@mom",
	 * "assign to Sam"...) is stripped from the title and returned as
	 * `assignedTo`. Matching is roster-scoped.
	 */
	members?: TaskQuickAddMember[];
}

/** Everything the Task preview renders, in one pass. */
export interface TaskQuickAddResult {
	title: string;
	/** ISO timestamp at end-of-target-day in the caller's zone, or null. */
	dueDate: string | null;
	priority: QuickAddPriority;
	/** Whether the phrase itself stated a priority (not just the default). */
	priorityStated: boolean;
	/** Matched roster member's userId, or null when no assignee phrase found. */
	assignedTo: string | null;
	/** `#tag` tokens found in the input (lowercased, deduped, sorted). */
	tags: string[];
	/** Recurrence cadence parsed from the title, or null. */
	recurrenceFrequency: RecurrenceFrequency | null;
	/** Multiplier for the cadence: "every 2 weeks" ⇒ weekly + interval 2. */
	recurrenceInterval: number | null;
	/** `#public`/`#private`; new tasks default to 'public'. */
	visibility: 'public' | 'private';
	/** True when an explicit #public/#private tag was present. */
	visibilityExplicit: boolean;
	/** True when an `@family` marker was present. */
	familyTask: boolean;
	/** An `@name` handle that did NOT uniquely match a roster member, with its `@`. */
	unknownMember: string | null;
	/** Whether anything beyond the title was recognized. */
	hasInfo: boolean;
	/** A one-line human summary; null when `hasInfo` is false. */
	summaryLabel: string | null;
}

/** Full weekday names for weekday arithmetic (Sunday = 0). */
const WEEKDAYS = WEEKDAY_FULL;

/** A `#tag` token: `#` followed by word chars and hyphens. */
const TASK_QUICK_ADD_TAG_RE = /#[\p{L}\p{N}_-]+/gu;

/**
 * `#public` / `#private`. `\b` keeps longer tags like `#privates` out, so
 * they stay ordinary content tags.
 */
const TASK_QUICK_ADD_VISIBILITY_TAG_RE = /#(public|private)\b/gi;

/** An `@handle` token: `@` followed by word chars. */
const TASK_QUICK_ADD_AT_TOKEN_RE = /@([\p{L}\p{N}_-]+)/gu;

/** "next friday"/"next mon" — matched whole so "next" isn't left orphaned. */
const TASK_QUICK_ADD_NEXT_WEEKDAY_RE = new RegExp(`\\bnext\\s+(${WEEKDAY_TOKEN})\\b`, 'i');

/** "jan 5", "february 14th", "dec 25, 2027" — month+day, optional year. */
const TASK_QUICK_ADD_MONTH_DATE_RE = new RegExp(
	`\\b(?:due\\s+)?${MONTH_NAME_TOKEN}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`,
	'i'
);

/** Clock times Canvas/LMS dump after a due date — only stripped with a date. */
const TASK_QUICK_ADD_CLOCK_RE = /\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi;

/**
 * "in 3 days", "in a week", "next month", "next year" — the "in"/"next"
 * prefix is required so "a week" / "2 weeks" never become dates by accident.
 */
const TASK_QUICK_ADD_RELATIVE_RE =
	/\b(?:in\s+(\d+|a|an)\s+(days?|weeks?|months?|years?)|next\s+(week|month|year))\b/i;

/** "today", "tomorrow", or a weekday, full or short. */
const TASK_QUICK_ADD_DATE_RE = new RegExp(
	`\\b(today|tomorrow|${WEEKDAY_FULL.concat(WEEKDAY_SHORT).join('|')})\\b`,
	'i'
);

/** Priority keywords, word-order tolerant. */
const TASK_QUICK_ADD_PRIORITY_RE =
	/\b(high\s*-?\s*priority|low\s*-?\s*priority|priority\s*[:=]?\s*(high|low)|not\s+urgent|urgent|asap)\b/i;

type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';

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
 * The assignee phrase matched in a quick-add input (including the trigger
 * word), so callers can slice it back out of the title.
 */
export interface TaskAssigneeMatch {
	userId: string;
	/** Index where the matched phrase (trigger + name) starts. */
	index: number;
	/** Length of the matched phrase, including the leading trigger. */
	length: number;
}

/**
 * Trigger words that may precede a roster member's name. `assign to` must
 * precede `assign` so the longer phrase wins at the same spot.
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
 * Returns the earliest occurrence, breaking ties toward the longest phrase
 * (so "First Last" beats a bare first name at the same spot). Roster-scoped:
 * no match ⇒ null, and nothing should be stripped.
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
// Date + recurrence machinery — every due lands at 23:59 in the caller zone
// ---------------------------------------------------------------------------

/** `now` in the caller's zone (an unknown zone falls back to UTC) at 23:59. */
function endOfDayNow(now: Date, zone: string): DateTime {
	const safe = IANAZone.isValidZone(zone) ? zone : 'UTC';
	return DateTime.fromJSDate(now, { zone: safe }).set({
		hour: 23,
		minute: 59,
		second: 0,
		millisecond: 0
	});
}

/** Next occurrence of a weekday token from `now`; today itself rolls a week. */
function nextWeekdayDate(now: Date, zone: string, token: string): DateTime {
	const target = endOfDayNow(now, zone);
	const full = WEEKDAYS.findIndex((d) => d.startsWith(token.toLowerCase().slice(0, 3)));
	if (full === -1) return target;
	return target.plus({ days: daysUntilWeekday(target.weekday % 7, full) });
}

/** Calendar shift on the zone's wall clock, clamping to the month's length. */
function shiftDate(base: DateTime, n: number, unit: RecurrenceUnit): DateTime {
	const shifted =
		unit === 'day'
			? base.plus({ days: n })
			: unit === 'week'
				? base.plus({ weeks: n })
				: unit === 'month'
					? base.plus({ months: n })
					: base.plus({ years: n });
	return shifted.set({ hour: 23, minute: 59, second: 0, millisecond: 0 });
}

/**
 * A month+day phrase → the zone's `DateTime` the shared rollover rule picked,
 * landing at the end of that day. `month` is 1-based.
 */
function monthDayDate(
	now: Date,
	zone: string,
	month: number,
	day: number,
	year: number | null
): DateTime {
	const today = endOfDayNow(now, zone);
	const calendar: CalendarDate = {
		year: today.year,
		month: today.month,
		day: today.day
	};
	const resolved = resolveMonthDay(calendar, month, day, year);
	if (!resolved) return today;
	return DateTime.fromObject(resolved, { zone: zone }).set({
		hour: 23,
		minute: 59,
		second: 0,
		millisecond: 0
	});
}

interface RecurrenceResult {
	frequency: RecurrenceFrequency | null;
	interval: number | null;
	/** Due date implied by the cadence ("every saturday"), or null. */
	due: DateTime | null;
	remaining: string;
}

/**
 * A weekday-anchored cadence: "every saturday" ⇒ weekly + that day's next
 * occurrence. It carries a DATE, so it cannot live in the shared cadence
 * table — but the interval and the frequency word come from the shared
 * cadence so "every other saturday" is biweekly here too.
 */
const TASK_QUICK_ADD_EVERY_OTHER_DAY_RE = new RegExp(`\\bevery\\s+other\\s+(${DAY_ALT})\\b`, 'i');
const TASK_QUICK_ADD_EVERY_DAY_RE = new RegExp(`\\bevery\\s+(${DAY_ALT})\\b`, 'i');

function weekdayAnchor(
	title: string,
	re: RegExp,
	now: Date,
	zone: string,
	every: number
): RecurrenceResult | null {
	const m = title.match(re);
	if (!m) return null;
	return {
		frequency: cadenceFrequency({ unit: 'week', every }),
		interval: every,
		due: nextWeekdayDate(now, zone, m[1]),
		remaining: stripMatch(title, m)
	};
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

/** Weekday anchors first (they carry a date), then the shared cadence table. */
function parseRecurrence(title: string, now: Date, zone: string): RecurrenceResult {
	return (
		weekdayAnchor(title, TASK_QUICK_ADD_EVERY_OTHER_DAY_RE, now, zone, 2) ??
		weekdayAnchor(title, TASK_QUICK_ADD_EVERY_DAY_RE, now, zone, 1) ??
		sharedCadence(title) ?? { frequency: null, interval: null, due: null, remaining: title }
	);
}

interface DateResolution {
	due: DateTime | null;
	match: RegExpMatchArray | null;
}

/**
 * Pick the FIRST date phrase that resolves: "next friday" → month+day →
 * "in N units"/"next week|month|year" → bare today/tomorrow/weekday.
 */
function resolveDateStep(title: string, now: Date, zone: string): DateResolution {
	const nw = title.match(TASK_QUICK_ADD_NEXT_WEEKDAY_RE);
	if (nw) return { due: nextWeekdayDate(now, zone, nw[1]), match: nw };

	const md = title.match(TASK_QUICK_ADD_MONTH_DATE_RE);
	if (md) {
		// MONTH_INDEX is 0-based; the shared rule takes 1-based months.
		const month = MONTH_INDEX_0[md[1].toLowerCase()] + 1;
		const year = md[3] ? parseInt(md[3], 10) : null;
		return { due: monthDayDate(now, zone, month, parseInt(md[2], 10), year), match: md };
	}

	const rel = title.match(TASK_QUICK_ADD_RELATIVE_RE);
	if (rel) {
		if (rel[2]) {
			const amount = rel[1];
			const n = amount === 'a' || amount === 'an' ? 1 : parseInt(amount, 10);
			// SAFETY: the regex only captures (days?|weeks?|months?|years?).
			const unit = rel[2].replace(/s$/, '') as RecurrenceUnit;
			return { due: shiftDate(endOfDayNow(now, zone), n, unit), match: rel };
		}
		const nextUnit = rel[3]?.toLowerCase();
		if (nextUnit) {
			// SAFETY: the `next` branch only captures week|month|year.
			return { due: shiftDate(endOfDayNow(now, zone), 1, nextUnit as RecurrenceUnit), match: rel };
		}
	}

	const bare = title.match(TASK_QUICK_ADD_DATE_RE);
	if (bare) {
		const token = bare[1].toLowerCase();
		if (token === 'today') return { due: endOfDayNow(now, zone), match: bare };
		if (token === 'tomorrow') {
			return { due: endOfDayNow(now, zone).plus({ days: 1 }), match: bare };
		}
		return { due: nextWeekdayDate(now, zone, token), match: bare };
	}

	return { due: null, match: null };
}

// ---------------------------------------------------------------------------
// Task scoping: @family / @name handles
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
 * Roster match for an `@handle` at `match.index` in `title`.
 * Each member contributes candidate names — firstName alone (which may be
 * MULTI-WORD, e.g. "Mary Ann"), lastName alone, and "First Last" — and a
 * candidate may consume as many following words as it needs. The greedy
 * longest match wins; two DIFFERENT members tied at that length are
 * ambiguous (`userId: null`). No candidate matches (unknown name) → null.
 */
function matchAtHandle(
	title: string,
	match: RegExpExecArray,
	members: TaskQuickAddMember[]
): AtHandleMatch | null {
	const rest = title.slice(match.index);
	const hits: AtHandleMatch[] = [];
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

/** The summary a preview may render without re-deriving it. */
function summarizeTask(
	result: Omit<TaskQuickAddResult, 'hasInfo' | 'summaryLabel'>,
	zone: string
): { hasInfo: boolean; summaryLabel: string | null } {
	const parts: string[] = [];
	if (result.dueDate) {
		const safe = IANAZone.isValidZone(zone) ? zone : 'UTC';
		parts.push(`due ${DateTime.fromISO(result.dueDate, { zone: safe }).toFormat('MMM d')}`);
	}
	if (result.priority !== 'normal') parts.push(`${result.priority} priority`);
	if (result.assignedTo) parts.push('assigned');
	if (result.recurrenceFrequency) {
		const noun =
			result.recurrenceFrequency === 'daily'
				? 'day'
				: result.recurrenceFrequency === 'weekly'
					? 'week'
					: result.recurrenceFrequency === 'monthly'
						? 'month'
						: 'year';
		parts.push(
			result.recurrenceInterval && result.recurrenceInterval > 1
				? `every ${result.recurrenceInterval} ${noun}s`
				: `every ${noun}`
		);
	}
	for (const tag of result.tags) parts.push(`#${tag}`);
	if (result.visibilityExplicit) parts.push(result.visibility);
	if (result.familyTask) parts.push('family task');
	if (result.unknownMember) parts.push(`unknown member ${result.unknownMember}`);
	const hasInfo =
		!!result.dueDate ||
		result.priority !== 'normal' ||
		!!result.assignedTo ||
		result.tags.length > 0 ||
		!!result.recurrenceFrequency ||
		result.visibilityExplicit ||
		result.familyTask ||
		!!result.unknownMember;
	if (!hasInfo) return { hasInfo: false, summaryLabel: null };
	return { hasInfo, summaryLabel: parts.join(' · ') };
}

/**
 * Parse a Task quick-add phrase: priority, due date, cadence, scoping,
 * `@member`/`for Name`, `#tags`, and the rebuilt title.
 */
export function parseTaskQuickAdd(raw: string, options: TaskQuickAddOptions): TaskQuickAddResult {
	const { now, zone, members } = options;
	let title = raw.trim();

	// 1. Priority keyword, removed from the title.
	let priority: QuickAddPriority = 'normal';
	let priorityStated = false;
	const pm = title.match(TASK_QUICK_ADD_PRIORITY_RE);
	if (pm) {
		priorityStated = true;
		priority = /(low|not\s+urgent)/.test(pm[0].toLowerCase()) ? 'low' : 'high';
		title = stripMatch(title, pm);
	}

	// 2. Recurrence cadence, removed from the title. "every saturday" also
	// carries its next occurrence through as the due date.
	let recurrenceFrequency: RecurrenceFrequency | null = null;
	let recurrenceInterval: number | null = null;
	const recurrence = parseRecurrence(title, now, zone);
	if (recurrence.frequency) {
		recurrenceFrequency = recurrence.frequency;
		recurrenceInterval = recurrence.interval;
		title = recurrence.remaining;
	}

	// 3. Natural-language due date, removed from the title ("friday" on a
	// friday = next friday; a passed "jan 5" rolls to next Jan 5).
	let dueDate: string | null = null;
	const resolved = resolveDateStep(title, now, zone);
	if (resolved.match) {
		dueDate = resolved.due!.toJSDate().toISOString();
		title = stripMatch(title, resolved.match)
			.replace(TASK_QUICK_ADD_CLOCK_RE, '')
			.replace(/\bdue\b/gi, '');
	} else if (recurrence.due) {
		dueDate = recurrence.due.toJSDate().toISOString();
	}

	// 3.5 Task scoping: `#public`/`#private` set visibility and
	// `@family`/`@name` handles set the target — each stripped. Runs BEFORE
	// the generic assignee pass so a resolved `@handle` wins over "for Dad".
	let visibility: 'public' | 'private' = 'public';
	let visibilityExplicit = false;
	let familyTask = false;
	let unknownMember: string | null = null;
	let sawAtToken = false;

	const visibilityMatches = [...title.matchAll(TASK_QUICK_ADD_VISIBILITY_TAG_RE)];
	if (visibilityMatches.length > 0) {
		visibilityExplicit = true;
		// SAFETY: the regex only captures public|private.
		visibility = visibilityMatches[visibilityMatches.length - 1][1].toLowerCase() as
			| 'public'
			| 'private';
		title = stripCuts(
			title,
			visibilityMatches.map((vm) => ({ at: vm.index!, len: vm[0].length }))
		);
	}

	// 4. Assignee phrase, removed from the title only when a real roster
	// member matches.
	let assignedTo: string | null = null;
	if (members && members.length > 0) {
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
			const hit = matchAtHandle(title, am, members);
			if (hit?.userId) {
				assignedTo = hit.userId;
				cuts.push({ at: am.index!, len: hit.length });
			} else {
				// Unknown or ambiguous member: never silently dropped. Cut what
				// the failed lookup consumed so no name fragment is left behind.
				unknownMember = `@${token}`;
				cuts.push({ at: am.index!, len: hit?.length ?? am[0].length });
			}
		}
		title = stripCuts(title, cuts);
	}

	if (!sawAtToken && members && members.length > 0) {
		const match = findTaskAssignee(title, members);
		if (match) {
			assignedTo = match.userId;
			title = title.slice(0, match.index) + title.slice(match.index + match.length);
		}
	}

	// 5. `#tag` tokens, stripped from the title and collected.
	const tags = normalizeQuickAddTags(title.match(TASK_QUICK_ADD_TAG_RE) ?? []);
	title = title.replace(TASK_QUICK_ADD_TAG_RE, '');

	title = title
		.replace(/^[\s:,\-–—;]+/, '')
		.replace(/\s{2,}/g, ' ')
		.trim();
	if (!title) title = raw.trim();

	const base = {
		title,
		dueDate,
		priority,
		priorityStated,
		assignedTo,
		tags,
		recurrenceFrequency,
		recurrenceInterval,
		visibility,
		visibilityExplicit,
		familyTask,
		unknownMember
	};
	const summary = summarizeTask(base, zone);
	return { ...base, hasInfo: summary.hasInfo, summaryLabel: summary.summaryLabel };
}
