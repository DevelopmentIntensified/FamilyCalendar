/**
 * parsing event quick-add — the orchestrator for ONE quick-add phrase.
 *
 * Runs the families in the legacy order (dates, time ranges, all-day,
 * recurrence, single times, place/attendants/calendar, title, `@ Location`,
 * defaults) so the claim book, the confidence floats and the title windows
 * are the ones the goldens pin. `compromise` is imported here and reached
 * lazily, so a phrase that resolves by regex never pays for compromise.
 *
 * Exported from `index.server.ts` only: this file pulls in compromise
 * (~352 KB), which the isomorphic entry must never bundle.
 *
 * `now` and `zone` are REQUIRED parameters (R5): relative dates, weekdays
 * and the default date all resolve in the caller's zone, never the host's.
 */
import { DateTime, IANAZone } from 'luxon';
import nlp from 'compromise';
import { createClaimBook } from './parsing.claims.rules';
import { MONTH_ALT } from './parsing.vocabulary.rules';
import { readEventDates } from './parsing.event-dates.rules';
import { createEventTimeState, readEventTimeRanges, readEventTimes } from './parsing.event-times.rules';
import { readEventRecurrence } from './parsing.event-recurrence.rules';
import { readEventPlace } from './parsing.event-place.rules';
import {
	applyEventDefaults,
	buildEventTitle,
	isAllDayPhrase,
	readAtLocation
} from './parsing.event-title.rules';
import { MIN_SEGMENT_CONFIDENCE, isScheduleOnlyTitle, segmentEventInput } from './parsing.event-segment.rules';

/** A parsed event prefill. `date` is `yyyy-MM-dd` in the caller's zone. */
export interface ParsedEvent {
	title: string;
	date: string;
	startTime?: string;
	endTime?: string;
	location?: string;
	description?: string;
	allDay: boolean;
	recurring?: string;
	attendants?: string[];
	duration?: string;
	/** Explicit date lists: "sept 23 & 30" → dates for N concrete events. */
	dates?: string[];
	/** Weekly day codes (MO..SU) mirroring events.recurrence_by_day. */
	recurringByDay?: string[];
	/** "for 6 weeks" / "10 times" — mirrors events.recurrence_count. */
	recurringCount?: number;
	/** "until Dec 15" — mirrors events.recurrence_until. */
	recurringUntil?: string;
	/** "on the family calendar" — matched against the user's calendars at creation. */
	calendarName?: string;
	/** "remind me 30 min before" — minutes before start. */
	reminderMinutes?: number;
}

/** The one quick-add parse: the prefill, its confidence and its own summary. */
export interface EventQuickAddResult {
	parsed: Partial<ParsedEvent>;
	confidence: number;
	/** Whether anything beyond the default title/date was recognized. */
	hasInfo: boolean;
	/** A one-line human summary of what was recognized; null when `hasInfo` is false. */
	summaryLabel: string | null;
}

/** Inputs the event grammar resolves against. */
export interface EventQuickAddOptions {
	/** The clock every relative date resolves against (R5). */
	now: Date;
	/** The IANA zone relative dates resolve in — required, never the host's. */
	zone: string;
}

/** The summary line a preview may render without re-deriving it. */
function summarizeEvent(parsed: Partial<ParsedEvent>): { hasInfo: boolean; summaryLabel: string | null } {
	const parts: string[] = [];
	if (parsed.startTime) {
		parts.push(parsed.endTime ? `${parsed.startTime}-${parsed.endTime}` : parsed.startTime);
	}
	if (parsed.recurring) {
		parts.push(
			parsed.recurringByDay?.length
				? `${parsed.recurring} ${parsed.recurringByDay.join(',')}`
				: parsed.recurring
		);
	}
	if (parsed.location) parts.push(`at ${parsed.location}`);
	if (parsed.calendarName) parts.push(parsed.calendarName);
	if (parsed.reminderMinutes !== undefined) parts.push(`remind ${parsed.reminderMinutes}m before`);
	const hasInfo =
		!!parsed.startTime ||
		!!parsed.endTime ||
		!!parsed.location ||
		!!parsed.description ||
		!!parsed.attendants?.length ||
		!!parsed.recurring ||
		!!parsed.dates ||
		!!parsed.recurringByDay ||
		parsed.recurringCount !== undefined ||
		!!parsed.recurringUntil ||
		!!parsed.calendarName ||
		parsed.reminderMinutes !== undefined ||
		parsed.allDay === true;
	if (!hasInfo) return { hasInfo: false, summaryLabel: null };
	return { hasInfo, summaryLabel: parts.length > 0 ? `${parsed.date} · ${parts.join(' · ')}` : parsed.date };
}

/**
 * Parse one quick-add phrase into a prefill hint. The caller always confirms
 * it — nothing here writes.
 */
export function parseEventQuickAdd(input: string, options: EventQuickAddOptions): EventQuickAddResult {
	const zone = IANAZone.isValidZone(options.zone) ? options.zone : 'UTC';
	const now = DateTime.fromJSDate(options.now, { zone });
	const result: Partial<ParsedEvent> = { allDay: false };
	let confidence = 0;
	const lower = input.toLowerCase();

	// Compromise is the heaviest dependency here — never build the doc
	// eagerly. Cheap regex matchers run first; NLP object access goes through
	// getDoc() so parses that resolve without it pay nothing for it.
	let nonUrlText = input;
	let doc: ReturnType<typeof nlp> | null = null;
	const getDoc = () => (doc ??= nlp(nonUrlText));

	// URLs are metadata, not title words: captured whole (kept in the
	// description), removed from every downstream text scan, and never cut
	// in half by the 50-char title window either.
	const urls = (input.match(/https?:\/\/\S+/gi) ?? []).map((u) => u.replace(/[.,;:!?)\]]+$/, ''));
	nonUrlText = urls.length > 0 ? input.replace(/https?:\/\/\S+/gi, ' ') : input;

	// Early "until <date>" capture: the until-date ends the series, so blank
	// it from date parsing (same length, so offsets stay aligned).
	const untilMatch = input.match(
		new RegExp(
			`\\buntil\\s+(?:(20\\d{2})-(\\d{2})-(\\d{2})|(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?|(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\.?(?:,?\\s*(20\\d{2}))?|(?:(this|next)\\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday))\\b`,
			'i'
		)
	);
	const dateInput = untilMatch
		? nonUrlText.replace(untilMatch[0], ' '.repeat(untilMatch[0].length))
		: nonUrlText;

	// Claim book (issue 112): each family registers the span it consumed; a
	// later rule reads the masked view instead of re-reading claimed words.
	const claims = createClaimBook();

	// Exact schedule spans consumed by the parser — the title step strips
	// these so the title = unmatched text + attendants.
	const stripSpans: string[] = [];

	// Consumed location spans — stripped from the title like schedule, but
	// NOT treated as schedule when deciding whether a "with"-list is
	// title-terminal.
	const titleOnlySpans: string[] = [];

	// ===== DATES =====
	const dates = readEventDates(dateInput, now, claims, stripSpans);
	if (dates.date) result.date = dates.date;
	if (dates.dates) result.dates = dates.dates;
	if (dates.startTime) result.startTime = dates.startTime;
	if (dates.endTime) result.endTime = dates.endTime;
	for (const increment of dates.confidence) confidence += increment;

	// ===== TIME RANGES =====
	const times = createEventTimeState();
	times.startTime = result.startTime;
	times.endTime = result.endTime;
	for (const increment of readEventTimeRanges(input, stripSpans, times)) confidence += increment;
	result.startTime = times.startTime;
	result.endTime = times.endTime;

	// ===== ALL-DAY =====
	if (isAllDayPhrase(lower)) {
		result.allDay = true;
		confidence += 0.15;
	}

	// ===== RECURRENCE =====
	const recurrencePhrases: string[] = [];
	const recurrenceState = {
		date: result.date,
		dates: result.dates,
		recurring: result.recurring,
		recurringByDay: result.recurringByDay,
		recurringCount: result.recurringCount,
		recurringUntil: result.recurringUntil,
		reminderMinutes: result.reminderMinutes
	};
	for (const increment of readEventRecurrence({
		text: input,
		dateInput,
		untilMatch,
		now,
		claims,
		stripSpans,
		state: recurrenceState,
		phrases: recurrencePhrases
	})) {
		confidence += increment;
	}
	result.date = recurrenceState.date;
	result.dates = recurrenceState.dates;
	result.recurring = recurrenceState.recurring;
	result.recurringByDay = recurrenceState.recurringByDay;
	result.recurringCount = recurrenceState.recurringCount;
	result.recurringUntil = recurrenceState.recurringUntil;
	result.reminderMinutes = recurrenceState.reminderMinutes;

	// ===== SINGLE TIMES, END CUES, DURATIONS =====
	times.startTime = result.startTime;
	times.endTime = result.endTime;
	for (const increment of readEventTimes(input, nonUrlText, claims, stripSpans, times)) {
		confidence += increment;
	}
	result.startTime = times.startTime;
	result.endTime = times.endTime;

	// ===== PLACE, CALENDAR, ATTENDANTS =====
	const placeState = {
		location: result.location,
		calendarName: result.calendarName,
		attendants: result.attendants
	};
	const placeReading = readEventPlace({
		nonUrlText,
		claimMasked: claims.mask(nonUrlText),
		rawInput: input,
		recurrencePhrases,
		stripSpans,
		titleOnlySpans,
		state: placeState,
		getDoc
	});
	nonUrlText = placeReading.nonUrlText;
	for (const increment of placeReading.confidence) confidence += increment;
	result.location = placeState.location;
	result.calendarName = placeState.calendarName;
	result.attendants = placeState.attendants;

	// ===== TITLE =====
	const titleReading = buildEventTitle({
		nonUrlText,
		lower,
		recurrencePhrases,
		stripSpans,
		titleOnlySpans,
		relativeDurationMatch: dateInput.match(
			/\bin\s+(a|\d+)\s*(minutes?|mins?|min|hours?|hrs?|hr)s?\b/i
		),
		relativeMatch: dateInput.match(/\bin\s+(a|\d+)\s+(day|week|month)s?\b/i)
	});
	if (titleReading.title !== undefined) result.title = titleReading.title;
	for (const increment of titleReading.confidence) confidence += increment;

	// ===== LOCATION FROM @ SYMBOL =====
	const atLocation = readAtLocation(nonUrlText, result.location);
	if (atLocation.location) result.location = atLocation.location;
	for (const increment of atLocation.confidence) confidence += increment;

	// ===== DEFAULTS =====
	applyEventDefaults(result, urls, now);

	const summary = summarizeEvent(result);
	return {
		parsed: result,
		confidence: Math.min(confidence, 1),
		hasInfo: summary.hasInfo,
		summaryLabel: summary.summaryLabel
	};
}

/**
 * Parse a phrase that may name several events. Fewer than two segments (or
 * fewer than two clearing the confidence gate) answers the single parse, so
 * the common case never degrades.
 */
export function parseEventQuickAddList(
	input: string,
	options: EventQuickAddOptions
): EventQuickAddResult[] {
	const candidates = segmentEventInput(input);
	if (candidates.length < 2) return [parseEventQuickAdd(input, options)];
	const parsed = candidates.map((c) => parseEventQuickAdd(c, options));
	if (parsed.filter((p) => p.confidence >= MIN_SEGMENT_CONFIDENCE).length < 2) {
		return [parseEventQuickAdd(input, options)];
	}
	// Continuation segments inherit the head's title + attendants (#052).
	const head = parsed[0].parsed;
	for (const p of parsed.slice(1)) {
		if (isScheduleOnlyTitle(p.parsed.title)) p.parsed.title = head.title;
		if ((!p.parsed.attendants || p.parsed.attendants.length === 0) && head.attendants?.length) {
			p.parsed.attendants = [...head.attendants];
		}
	}
	return parsed;
}
