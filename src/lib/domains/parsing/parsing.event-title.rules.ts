/**
 * parsing event title and defaults — the title is the unmatched text.
 *
 * Recurrence phrases and claimed schedule/place spans are stripped; the
 * first 50 characters are kept, a cut inside a word snaps back to the last
 * space, a dangling connector and trailing punctuation go, and the raw
 * window survives only a completely emptied one; the `@ Location`
 * suffix, today's date, the 09:00–17:00 all-day window and the confidence
 * cap are the defaults applied last.
 */
import type { DateTime } from 'luxon';
import { escapeRegExp } from './parsing.vocabulary.rules';

/** Title stop-words: schedule connectors left after span stripping. */
const TITLE_STOP = new Set(['on', 'from', 'for', 'at', 'to', 'and', 'or', '&', 'am', 'pm', 'in']);

/** Cosmetic digit-times the parser consumed ("5:30", "9am", "a5pm"). */
const TITLE_TIME_RES = [
	/\bat\s+\d{1,2}(?::\d{2})?\s*(?:[ap])\.?\s?m\.?(?![a-z])/gi,
	/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi,
	/\b\d{1,2}:\d{2}\s*((?:[ap])\.?\s?m\.?(?![a-z])|am|pm)?\s*[-–—]\s*\d{1,2}:\d{2}\s*((?:[ap])\.?\s?m\.?(?![a-z])|am|pm)?/gi,
	/\b\d{1,2}(?::\d{2})?\s*(?:[ap])\.?\s?m\.?(?![a-z])/gi,
	/\b\d{1,2}:\d{2}(?:\s*(?:am|pm))?\b/gi,
	/\ba\s*\d{1,2}(?::?\d{2})?\s*(?:am|pm)\b/gi,
	/\ba\s*\d{1,2}(?::?\d{2})?\s*(?:[ap])\.?\s?m\.?(?![a-z])/gi,
	/\b\d{1,2}\s*(?:am|pm)\b/gi,
	/\b\d{1,2}\s*(?:[ap])\.?\s?m\.?(?![a-z])/gi
];

/**
 * Strip consumed schedule spans plus cosmetic digit-times. Spans become
 * DOUBLE spaces so the cleanup can tell connector words left behind by
 * stripping ("on", "and") from real title words.
 */
export function stripTitleSpans(title: string, phrases: string[]): string {
	let text = title;
	for (const phrase of phrases) {
		text = text.replace(new RegExp(escapeRegExp(phrase), 'i'), '  ');
	}
	for (const re of TITLE_TIME_RES) text = text.replace(re, '  ');
	return text;
}

/**
 * Drop leftover connectors ("running on   and   at   for fun" -> "running
 * fun"). Double spaces mark where spans were removed: a STOP word beside a
 * gap (or edge/punctuation) goes; mid-title connectors between real words
 * ("fish and chips") stay. Runs until stable (max 3 passes).
 */
export function cleanTitleText(title: string): string {
	let text = title;
	for (let pass = 0; pass < 3; pass++) {
		const tokens = text.split(' ');
		const nonEmpty = tokens.filter((t) => t.length > 0);
		const first = nonEmpty[0];
		const last = nonEmpty[nonEmpty.length - 1];
		const kept = tokens.filter((t, i) => {
			if (t === '') return false;
			const core = t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '').toLowerCase();
			if (core === '') return false;
			if (!TITLE_STOP.has(core)) return true;
			// A title may open with a meridiem token ("PM Certification 4 Days…"):
			// with no hour before it, it is text, never a time marker (issue 107).
			const lead = tokens.findIndex((x) => x !== '');
			const isLeadingMeridiem = i === lead && (core === 'am' || core === 'pm');
			if (isLeadingMeridiem) return true;
			const prev = tokens[i - 1] ?? '';
			const next = tokens[i + 1] ?? '';
			const isPunct = (s: string) => s.length > 0 && /^[^a-z0-9]+$/i.test(s);
			if (
				t === first ||
				t === last ||
				t !== core ||
				prev === '' ||
				next === '' ||
				isPunct(prev) ||
				isPunct(next)
			) {
				return false;
			}
			// STOP runs: consecutive STOPs on the squeezed sequence go together
			// ("running on and for fun" loses on/and/for; "fish and chips" keeps
			// its lone and).
			const sqIdx: number[] = [];
			tokens.forEach((x, j) => {
				if (x !== '') sqIdx.push(j);
			});
			const pos = sqIdx.indexOf(i);
			const sqStop = (p: number) => {
				if (p < 0 || p >= sqIdx.length) return false;
				const tok = tokens[sqIdx[p]];
				return TITLE_STOP.has(tok.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '').toLowerCase());
			};
			return !(sqStop(pos - 1) || sqStop(pos + 1));
		});
		const next = kept.join(' ').trimStart();
		if (next === text) return next;
		text = next;
	}
	return text;
}

/** All-day cues: the noun "birthday" sets all-day but keeps a stated time. */
export function isAllDayPhrase(lower: string): boolean {
	return ['all day', 'all-day', 'whole day', 'birthday'].some((p) => lower.includes(p));
}

/** What the title step read. */
export interface EventTitleReading {
	title?: string;
	confidence: number[];
}

/**
 * Build the title from the unmatched text, then apply the relative-duration
 * sentence rule. Expected values come from the legacy window behaviour.
 */
export function buildEventTitle(input: {
	nonUrlText: string;
	lower: string;
	recurrencePhrases: string[];
	stripSpans: string[];
	titleOnlySpans: string[];
	relativeDurationMatch: RegExpMatchArray | null;
	relativeMatch: RegExpMatchArray | null;
}): EventTitleReading {
	const { nonUrlText, lower, recurrencePhrases, stripSpans, titleOnlySpans } = input;
	const confidence: number[] = [];
	let resultTitle: string | undefined;

	// Always take the first 50 chars of input as title. URLs were already
	// removed, so links ride whole in the description and are never cut here.
	let titleSource = nonUrlText;
	// Recurrence phrases describe the schedule, not the event name.
	for (const phrase of recurrencePhrases) {
		titleSource = titleSource.replace(new RegExp(escapeRegExp(phrase), 'i'), ' ');
	}
	titleSource = titleSource.replace(/\s{2,}/g, ' ').trimStart();
	let title = titleSource.substring(0, 50);
	// Never end the title mid-word: when the 50-char cut lands inside a
	// word ("with nathan an"), snap back to the last space.
	if (titleSource.length > 50 && /\S/.test(titleSource[50] ?? '') && !/\s$/.test(title)) {
		const cut = title.lastIndexOf(' ');
		if (cut > 3) title = title.slice(0, cut);
	}
	// A connector left dangling by the snap ("…jennifer and") goes too — but
	// only when nothing follows it, so the pinned "dinner for " cut survives.
	// (?<!\d) keeps an hour's own meridiem ("…saturday 10 am") for the
	// cosmetic half-strip, which removes the whole time (issue 107).
	title = title.replace(/(?<!\d)\s+(?:and|or|on|at|to|for|from|&|am|pm|in)$/i, '');
	// Remove trailing punctuation (but preserve spaces to match the window).
	title = title.replace(/[.,;:!?]+$/, '');

	if (title.length > 3 && !title.match(/^[\s,]*$/)) {
		resultTitle = title;
		confidence.push(0.2);
	}

	// Title refinement: title = unmatched text + attendants. Compare on the
	// 50-char window itself: spans stripped beyond it must not reformat the
	// pinned first-50 title.
	{
		const window = resultTitle ?? '';
		const strippedWindow = stripTitleSpans(window, [
			...recurrencePhrases,
			...stripSpans,
			...titleOnlySpans
		]);
		const cleaned = cleanTitleText(strippedWindow);
		// Clean when spans were stripped here, or when the window opens with a
		// connector the pre-window strip stranded ("friday and saturday dinner"
		// → "and dinner"). Windows that merely END in a stop word ("…for ")
		// are pinned cuts — never touched.
		if (
			(strippedWindow !== window ||
				/^[^a-z0-9]*\b(on|from|for|at|to|and|or|&|am|pm)\b/i.test(window)) &&
			window
		) {
			const final = cleaned.replace(/[.,;:!?]+$/, '');
			// Any non-empty remainder wins, however short: "run at snow flex"
			// leaves exactly "run". The raw-text fallback is the LAST resort.
			if (final.length > 0 && !/^[\s,]*$/.test(final)) {
				resultTitle = final;
			} else {
				const fallback = nonUrlText.substring(0, 50).replace(/[.,;:!?]+$/, '');
				if (fallback.length > 0) resultTitle = fallback;
			}
		}

		// Relative-duration phrases ("remind me ... in 48hrs") keep their whole
		// sentence as the name: the temporal span is schedule, stripped, but
		// the remaining text is never truncated by the 50-char window either.
		if (
			input.relativeDurationMatch ||
			(input.relativeMatch && lower.startsWith('remind me'))
		) {
			const stripped = stripTitleSpans(nonUrlText, [
				...recurrencePhrases,
				...stripSpans,
				...titleOnlySpans
			]);
			const candidate = cleanTitleText(stripped)
				.replace(/\s{2,}/g, ' ')
				.trim()
				.replace(/[.,;:!?]+$/, '');
			if (candidate.length > 0) resultTitle = candidate;
		}
	}

	return { title: resultTitle, confidence };
}

/**
 * "Event Title @ Location" — the suffix is a location only when it is under
 * 100 characters and stops at a date/time/"View & RSVP". URL-free text: an
 * `@` inside a link is not a location separator.
 */
export function readAtLocation(
	nonUrlText: string,
	currentLocation: string | undefined
): { location?: string; confidence: number[] } {
	if (!nonUrlText.includes('@')) return { confidence: [] };
	if (currentLocation) return { confidence: [] };
	const afterAt = nonUrlText.substring(nonUrlText.indexOf('@') + 1).trim();
	if (afterAt.length === 0) return { confidence: [] };

	// Stop at date patterns, time patterns, "View & RSVP", etc.
	const stopRegex =
		/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}|thursday|friday|saturday|sunday|monday|tuesday|wednesday|\d{1,2}:\d{2}\s*(?:am|pm)|\b(?:view\s*&\s*rsvp|event\s*details)\b/gi;

	let locationPart = afterAt;
	const stopMatch = locationPart.search(stopRegex);
	if (stopMatch > 0) {
		locationPart = locationPart.substring(0, stopMatch);
	}

	const cleanedLocation = locationPart.replace(/\s+/g, ' ').trim();
	if (cleanedLocation.length > 0 && cleanedLocation.length < 100) {
		return { location: cleanedLocation, confidence: [0.15] };
	}
	return { confidence: [] };
}

/** The defaults applied after every family has run. */
export function applyEventDefaults(
	state: {
		date?: string;
		startTime?: string;
		endTime?: string;
		allDay?: boolean;
		description?: string;
	},
	urls: string[],
	now: DateTime
): void {
	// Links live whole in the description; the title never carries one.
	if (urls.length > 0 && !state.description) {
		state.description = urls.join(' ');
	}
	if (!state.date) {
		state.date = now.toFormat('yyyy-MM-dd');
	}
	if (state.allDay && !state.startTime) {
		state.startTime = '09:00';
		state.endTime = '17:00';
	}
}
