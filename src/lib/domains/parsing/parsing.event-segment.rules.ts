/**
 * parsing event segmentation — one quick-add phrase that names several
 * events ("dinner Friday and movie Saturday") becomes one segment per event.
 *
 * Split order: `;`/newline, else commas only when EVERY part carries its own
 * signal, else `and` only when both halves carry a signal and no
 * weekday-pair/date-chain/with-list veto applies.
 */
import { MONTH_ALT, extractDayTokens } from './parsing.vocabulary.rules';
import { withListSpans } from './parsing.event-place.rules';

/**
 * A segment carries its own when/where when it names a date, time, or
 * recurrence — both sides need one or "fish and chips Friday" would split.
 */
const SEGMENT_SIGNAL =
	/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tomorrow|today|yesterday|weekend|daily|weekly|monthly|yearly|every|january|february|march|april|may|june|july|august|september|october|november|december|\d)\b/i;

/**
 * Stricter signal for comma splits: bare digits don't count, so year
 * fragments ("Sept 5, 2026 party") and counts ("Buy milk, eggs") never
 * split. Weekdays, months, times, and recurrence words do.
 */
const COMMA_SIGNAL =
	/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tomorrow|today|yesterday|weekend|daily|weekly|monthly|yearly|every|january|february|march|april|may|june|july|august|september|october|november|december)\b|\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(?:am|pm)\b/i;

/** Minimum confidence for a segment to count as its own event. */
export const MIN_SEGMENT_CONFIDENCE = 0.3;

/**
 * Date-atom edge tests for chain vetoes: a separator with a date atom hard
 * against it on BOTH sides joins a date list ("today and tomorrow", "sept 23
 * and 30", "friday and the 5th") — one multi-date parse, not two events.
 */
const WEEKDAY_ATOM =
	'\\b(?:sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nes|nesday)?|thu(?:r?s?(?:day)?)?|fri(?:day)?|sat(?:ur|urday)?)\\b';
const REL_ATOM = '\\b(?:today|tomorrow|yesterday)\\b';
const DATE_END_RE = new RegExp(
	`(?:${REL_ATOM}|${WEEKDAY_ATOM}|\\b(?:${MONTH_ALT})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH_ALT})|\\b\\d{1,2}(?:st|nd|rd|th)\\s+of\\s+(?:${MONTH_ALT})|\\b20\\d{2}-\\d{2}-\\d{2})\\s*$`,
	'i'
);
const DATE_START_RE = new RegExp(
	`^\\s*(?:the\\s+)?(?:${REL_ATOM}|${WEEKDAY_ATOM}|\\b(?:${MONTH_ALT})\\.?\\s+\\d{1,2}|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH_ALT})|\\b\\d{1,2}(?:st|nd|rd|th)\\s+of\\s+(?:${MONTH_ALT})|\\b\\d{1,2}\\b(?!\\s*:)|\\b20\\d{2}-\\d{2}-\\d{2})`,
	'i'
);

/** Split positions that survive the vetoes (chain joins, attendee lists). */
function survivingCuts(
	input: string,
	seps: RegExpMatchArray[],
	sepLen: (m: RegExpMatchArray) => number
): number[] {
	const spans = withListSpans(input);
	const cuts: number[] = [];
	for (const m of seps) {
		const i = m.index ?? 0;
		const left = input.slice(0, i);
		const right = input.slice(i + sepLen(m));
		const chainJoin = DATE_END_RE.test(left) && DATE_START_RE.test(right);
		const inWithList = spans.some(([s, e]) => i >= s && i < e);
		if (!chainJoin && !inWithList) cuts.push(i);
	}
	return cuts;
}

/** Split input at the given separator positions (absolute indices). */
function splitAt(input: string, cuts: number[], cutLen: number): string[] {
	const parts: string[] = [];
	let prev = 0;
	for (const c of cuts) {
		parts.push(input.slice(prev, c));
		prev = c + cutLen;
	}
	parts.push(input.slice(prev));
	return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * A segment title carrying nothing but schedule words ("friday from
 * 5:30-9pm") is a continuation of the first segment, not its own name —
 * it inherits the head title + attendants.
 */
export function isScheduleOnlyTitle(title: string | undefined): boolean {
	if (!title || title.trim().length === 0) return true;
	const SCHEDULE_WORD =
		'(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat|today|tomorrow|yesterday|weekend|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|from|to|till|until|between|and|or|at|on|for|the|a|of)';
	const SCHEDULE_TOKEN = `(?:${SCHEDULE_WORD}|\\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}:\\d{2}|\\d{1,2}\\s*(?:am|pm)|[-–])`;
	return new RegExp(`^(?:\\s*${SCHEDULE_TOKEN})*\\s*$`, 'i').test(title);
}

/** Split on commas only when every part carries its own signal. */
function splitOnComma(input: string): string[] {
	const commas = [...input.matchAll(/,/g)];
	if (commas.length === 0) return [input];
	const cuts = survivingCuts(input, commas, () => 1);
	if (cuts.length === 0) return [input];
	const parts = splitAt(input, cuts, 1);
	if (parts.length < 2) return [input];
	if (!parts.every((p) => COMMA_SIGNAL.test(p))) return [input];
	return parts;
}

/**
 * Split on "and" between two signal-bearing halves, else no split.
 * Vetoes: day-coordinated pairs ("on Tuesday and Thursday" — one series,
 * typos included), date-chain joins, and attendee lists. Commas don't veto.
 */
function splitOnAnd(input: string): string[] {
	const ands = [...input.matchAll(/\band\b/gi)];
	if (ands.length === 0) return [input];
	const tokens = extractDayTokens(input);
	for (let i = 0; i + 1 < tokens.length; i++) {
		const between = input.slice(tokens[i].index + tokens[i].raw.length, tokens[i + 1].index);
		if (/^\s*(and|&)\s*$/i.test(between)) return [input];
	}
	const cuts = survivingCuts(input, ands, () => 3);
	if (cuts.length === 0) return [input];
	const parts = splitAt(input, cuts, 3);
	if (!parts.every((p) => SEGMENT_SIGNAL.test(p))) return [input];
	return parts;
}

/**
 * The candidate segments for the multi-event shortcut. One entry means the
 * phrase is a single event and the caller must parse it whole.
 */
export function segmentEventInput(input: string): string[] {
	const hardSplit = input
		.split(/[;\n]+/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	if (hardSplit.length > 1) return hardSplit;
	const commaSplit = splitOnComma(input);
	return commaSplit.length > 1 ? commaSplit : splitOnAnd(input);
}
