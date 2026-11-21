/**
 * parsing event place — the location priority ladder, the five-word place
 * grammar, calendar targeting and the attendant ladder.
 *
 * Place priority: `location: X` > `location at|is|in X` > bare uppercase
 * token ≤4 chars > street address > `goes (over) to|heading to` > `at X` /
 * `in the X` > compromise `places()` > `at home` > `at my|our X [on <Addr>]`
 * > `on <Address>` > `at X studio|center|…`. Attendants: with-list > `invite
 * X` > speaker patterns > group patterns > compromise `people()`.
 *
 * `getDoc` is lazy so a parse that resolves without compromise never builds
 * one. Nothing here reads a clock.
 */
import nlp from 'compromise';
import { escapeRegExp } from './parsing.vocabulary.rules';

/** A compromise document, built on first use. */
type NlpDoc = ReturnType<typeof nlp>;

// ===== Places introduced by "at" / "in the" (issue 108) =====

/**
 * Words that END a place name: schedule prepositions first, then the
 * conjunctions that hand it to company ("with george").
 */
const PLACE_TAIL_WORDS = new Set([
	'on',
	'at',
	'from',
	'in',
	'to',
	'for',
	'by',
	'until',
	'till',
	'til',
	'after',
	'before',
	'during',
	'through',
	'starting',
	'ending',
	'around',
	'with',
	'and',
	'but',
	'or',
	'nor',
	'plus',
	'because',
	'since',
	'then',
	'so',
	'if',
	'when',
	'while'
]);

/**
 * A whole token that ends a place name on its own: a weekday, a month, an
 * ordinal day, a relative day, a relative-day determiner.
 */
const PLACE_CALENDAR_WORD =
	/^(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|today|tomorrow|tonight|yesterday|weekend|week|month|year|next|last|this|that|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth)$/i;

/**
 * A clock or a bare number: "at 8", "at 2pm", "at 8:00", "at 30" are never
 * the name of a place. Digits INSIDE a name are fine ("Room 201").
 */
const PLACE_CLOCK = /^(?:\d+(?::\d+)?[ap]\.?m\.?|\d+(?::\d+)?|[ap]\.?m\.?)$/i;

/**
 * "at" whose object is not a place: a bare article ("at the"), a daypart
 * ("at noon"), a meal ("at lunch"), or a phrase a dedicated rule owns
 * ("at home", "at my apartment"). Rejecting defers to that rule.
 */
const PLACE_HEAD_BLOCKLIST = new Set([
	'the',
	'a',
	'an',
	'home',
	'my',
	'our',
	'noon',
	'midnight',
	'morning',
	'afternoon',
	'evening',
	'night',
	'dusk',
	'dawn',
	'sunset',
	'sunrise',
	'bedtime',
	'lunch',
	'breakfast',
	'dinner',
	'suppertime',
	'naptime',
	'sharp',
	'all'
]);

/** One word of a place: letters, digits, internal apostrophes/dots/hyphens. */
const PLACE_WORD = /[A-Za-z0-9][A-Za-z0-9'’.-]*/y;

/**
 * Mid-place text that is actually clock data ends the name ("at ccl 6-8pm"
 * is ccl). Bare numbers stay place words ("Room 201", "Route 9").
 */
const PLACE_TIME_GUARD =
	/^(?:\d{1,2}(?::\d{2})+|\d{1,2}\s*(?:(?:[ap])\.?\s?m\.?|am|pm)|\d{1,2}\s*[-–—to]+\s*\d{1,2}\s*(?:(?:[ap])\.?\s?m\.?|am|pm))/i;

/**
 * Read the place that starts at `from` — the first character AFTER the
 * opener match. Stops at the first terminator, after at most five words.
 * Null when there is nothing place-shaped there.
 */
export function readPlacePhrase(
	text: string,
	from: number
): { place: string; length: number } | null {
	let end = from;
	for (let words = 0; words < 5; words++) {
		const start = words === 0 ? end : end + 1;
		if (words > 0 && !/[\s ]/.test(text[end] ?? '')) break;
		if (words > 0 && PLACE_TIME_GUARD.test(text.slice(start))) break;
		PLACE_WORD.lastIndex = start;
		const token = PLACE_WORD.exec(text)?.[0];
		if (!token) break;
		// "St." keeps its dot — it is part of the name, not a gap.
		const word = token.replace(/[.-]+$/, '');
		if (!word) break;
		if (words === 0 && (PLACE_HEAD_BLOCKLIST.has(word.toLowerCase()) || PLACE_CLOCK.test(word))) {
			return null;
		}
		if (PLACE_TAIL_WORDS.has(word.toLowerCase()) || PLACE_CALENDAR_WORD.test(word)) break;
		end = start + token.length;
	}
	if (end <= from) return null;
	return { place: text.slice(from, end), length: end - from };
}

/**
 * The first "at <place>" (article optional) or "in the <place>", with the
 * exact span it consumed — preposition and article included. The article is
 * only consumed in lower case, so "at The Olive Garden" keeps "The".
 */
export function matchPlacePhrase(text: string): { place: string; span: string } | null {
	const opener = /\b(?:at|in)\s+/gi;
	let match: RegExpExecArray | null;
	while ((match = opener.exec(text)) !== null) {
		const start = match.index + match[0].length;
		const article = /^the\s+/.exec(text.slice(start))?.[0] ?? '';
		if (match[0].toLowerCase().startsWith('in') && !article) continue;
		const found = readPlacePhrase(text, start + article.length);
		if (found)
			return {
				place: found.place,
				span: text.slice(match.index, start + article.length + found.length)
			};
	}
	return null;
}

/**
 * "goes to <place>" / "goes over to" / "heading to" — a movement verb
 * pointing at a destination reads the same place grammar as "at <place>".
 */
export function matchGoPlacePhrase(text: string): { place: string; span: string } | null {
	const opener = /\b(?:goes\s+(?:over\s+)?to|heading\s+to)\s+/gi;
	let match: RegExpExecArray | null;
	while ((match = opener.exec(text)) !== null) {
		const found = readPlacePhrase(text, match.index + match[0].length);
		if (found)
			return {
				place: found.place,
				span: text.slice(match.index, match.index + match[0].length + found.length)
			};
	}
	return null;
}

// ===== Attendant lists (shared with segmentation) =====

/**
 * Attendee-list spans ("with james and joseph"): an "and"/comma inside one
 * never splits events. Names run two words max (first + last); a schedule
 * word in second position ends the list ("kelvin tomorrow").
 */
const WITH_NAME_STOP =
	'today|tomorrow|yesterday|weekend|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|am|pm|morning|afternoon|evening|noon|night|midnight|at|on|for|from|to|until|by|in|of|with|every|repeat|weekly|daily|monthly|all|each|next|this|last|remind|reminder|invite|and|or|the|a|an|my|our';
const WITH_NAME_ITEM = `[A-Za-z][A-Za-z'’-]*(?:\\s+(?!${WITH_NAME_STOP}\\b)[A-Za-z][A-Za-z'’-]*)?`;
export const WITH_LIST_PATTERN = `\\bwith\\s+(${WITH_NAME_ITEM}(?:(?:\\s+and\\s+|\\s*&\\s*|\\s*,\\s*)${WITH_NAME_ITEM})*)`;

/** Every "with …" attendee list's character span in `text`. */
export function withListSpans(text: string): Array<[number, number]> {
	const spans: Array<[number, number]> = [];
	for (const m of text.matchAll(new RegExp(WITH_LIST_PATTERN, 'gi'))) {
		const start = m.index ?? 0;
		spans.push([start, start + m[0].length]);
	}
	return spans;
}

// ===== The location ladder =====

/** The location/calendar fields one parse run builds. */
export interface EventPlaceState {
	location?: string;
	calendarName?: string;
	attendants?: string[];
}

/** What the place family read, plus the text the with-list step blanked. */
export interface EventPlaceReading {
	confidence: number[];
	nonUrlText: string;
}

/**
 * Location, then calendar targeting, then attendants — the legacy order.
 * Mutates `state` and returns the (possibly blanked) URL-free text.
 */
export function readEventPlace(input: {
	nonUrlText: string;
	claimMasked: string;
	rawInput: string;
	recurrencePhrases: string[];
	stripSpans: string[];
	titleOnlySpans: string[];
	state: EventPlaceState;
	getDoc: () => NlpDoc;
}): EventPlaceReading {
	const { claimMasked, rawInput, recurrencePhrases, stripSpans, titleOnlySpans, state, getDoc } =
		input;
	let nonUrlText = input.nonUrlText;
	const confidence: number[] = [];

	// "Location: X" or "location: X" — explicit location keyword (highest priority)
	const explicitLocMatch = nonUrlText.match(
		/\blocation\s*:\s*(.+?)(?:\n|$|type:|date:|time:|description:)/i
	);
	if (explicitLocMatch) {
		state.location = explicitLocMatch[1].trim();
		confidence.push(0.25);
	}

	// "location at X" or "location is X"
	const locKeywordMatch = nonUrlText.match(/\blocation\s+(?:at|is|in)\s+([A-Za-z][a-z0-9 ]*)/i);
	if (locKeywordMatch && !state.location) {
		state.location = locKeywordMatch[1].trim();
		confidence.push(0.2);
		titleOnlySpans.push(locKeywordMatch[0]);
	}

	// "at X" where X is a short uppercase token (e.g. "at LU", "at HR")
	const atShortLocMatch = nonUrlText.match(/\bat\s+([A-Z]{1,4})\b/);
	if (atShortLocMatch && !state.location) {
		state.location = atShortLocMatch[1];
		confidence.push(0.15);
		titleOnlySpans.push(atShortLocMatch[0]);
	}

	// Street address: "442 cherry hill dr., rustburg, va 24588" — the whole
	// thing, not a compromise-places fragment. The street type must end at a
	// word boundary, the bridge stays short and never carries a meridiem,
	// and times/counts never match.
	const streetAddressMatch = nonUrlText.match(
		/\b(\d{1,6}\s+(?:(?!am\b|pm\b)[A-Za-z0-9.'#-]+\s+){0,4}?(?:street|st|drive|dr|avenue|ave|road|rd|lane|ln|court|ct|boulevard|blvd|way|circle|cir|place|pl|terrace|trail|parkway|highway|hwy)\b\.?(?:\s*,\s*[A-Za-z][A-Za-z .'-]*,\s*[A-Za-z]{2}\s+\d{5}(?:-\d{4})?)?)/i
	);
	if (streetAddressMatch && !state.location) {
		state.location = streetAddressMatch[1].trim();
		confidence.push(0.2);
		stripSpans.push(streetAddressMatch[1]);
	}

	// "goes to <place>" / "heading to <place>"
	const goPlace = !state.location ? matchGoPlacePhrase(nonUrlText) : null;
	if (goPlace) {
		state.location = goPlace.place;
		confidence.push(0.15);
		titleOnlySpans.push(goPlace.span);
	}

	// "at <place>" (article optional) and "in the <place>" — one rule.
	const placePhrase = !state.location ? matchPlacePhrase(nonUrlText) : null;
	if (placePhrase) {
		state.location = placePhrase.place;
		confidence.push(0.15);
		titleOnlySpans.push(placePhrase.span);
	}

	// Compromise places, lazily and only as a fallback.
	if (!state.location) {
		const places = getDoc().places().out('array');
		if (places.length > 0) {
			state.location = places[0];
			confidence.push(0.15);
			titleOnlySpans.push(places[0]);
		}
	}

	// "at home"
	const atHomeMatch = nonUrlText.match(/\bat\s+home\b/i);
	if (atHomeMatch && !state.location) {
		state.location = 'Home';
		confidence.push(0.1);
		titleOnlySpans.push(atHomeMatch[0]);
	}

	// "at my apartment on 42 Maple Drive" or "at my apartment"
	const myPlaceMatch = claimMasked.match(
		/at\s+(?:my|our)\s+([a-z]+)(?:\s+on\s+(\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*))?/i
	);
	if (myPlaceMatch && !state.location) {
		if (myPlaceMatch[2]) {
			state.location = myPlaceMatch[2].trim();
		} else {
			state.location = myPlaceMatch[1]
				? myPlaceMatch[1].charAt(0).toUpperCase() + myPlaceMatch[1].slice(1)
				: 'Home';
		}
		confidence.push(0.1);
		titleOnlySpans.push(myPlaceMatch[0]);
	}

	// Address: "at 450 Main Street" or standalone address after "on"
	const addressMatch = claimMasked.match(/\bon\s+(\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
	if (addressMatch && !state.location) {
		state.location = addressMatch[1].trim();
		confidence.push(0.15);
		titleOnlySpans.push(addressMatch[0]);
	}

	// "at X studio", "at X center", "at X park"
	const generalLocMatch = nonUrlText.match(
		/at\s+(?:the\s+)?([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)*\s+(?:studio|center|park|garden|square|clubhouse|trailhead))/i
	);
	if (generalLocMatch && !state.location) {
		state.location = generalLocMatch[1].trim();
		confidence.push(0.15);
		titleOnlySpans.push(generalLocMatch[0]);
	}

	// Strip trailing punctuation from location
	if (state.location) {
		state.location = state.location.replace(/[.,;:!?]+$/, '');
	}

	// Calendar targeting: "on the family calendar", "to my work calendar".
	const calendarMatch = claimMasked.match(
		/\b(?:on|to)\s+(?:the\s+|my\s+)?([A-Za-z][A-Za-z ]*?)\s+calendar\b/i
	);
	if (calendarMatch) {
		state.calendarName = `${calendarMatch[1].trim()} calendar`;
		confidence.push(0.15);
		stripSpans.push(calendarMatch[0]);
	}

	// Bare routing: "stalkers campout family calendar" / "family calendar
	// stalkers campout" — the household defaults are safe to route without
	// an on/to preposition; arbitrary names still need one.
	const bareCalendarMatch =
		!state.calendarName && claimMasked.match(/\b(family|personal)\s+calendar\s*[.!]?\s*$/i);
	const leadingCalendarMatch =
		!state.calendarName && claimMasked.match(/^(?:the\s+|my\s+)?(family|personal)\s+calendar\b/i);
	const bareMatch = bareCalendarMatch ?? leadingCalendarMatch;
	if (bareMatch) {
		// SAFETY: the alternation above whitelists family|personal only.
		state.calendarName = `${bareMatch[1]} calendar`;
		confidence.push(0.15);
		stripSpans.push(bareMatch[0]);
	}

	// ===== ATTENDANTS =====

	// "with X", "with X and Y and Z" — explicit lists are the trustworthy
	// source. A lowercase list needs one compromise person hit
	// ("with pizza and drinks" is never people).
	const withMatch = nonUrlText.matchAll(new RegExp(WITH_LIST_PATTERN, 'gi'));
	let withSpan: { text: string; end: number } | null = null;
	for (const m of withMatch) {
		const items = m[1]
			.split(/\s*(?:,|\band\b|&)\s*/i)
			.map((n) => n.trim())
			.filter((n) => n.length > 0)
			.filter((n) => !/^(?:the|a|an)\b/i.test(n))
			.filter((n) => n.split(/\s+/).length <= 2);
		if (items.length === 0) continue;
		const lowerItems = items.filter((n) => /^[a-z]/.test(n));
		if (lowerItems.length > 0 && !lowerItems.some((n) => nlp(n).people().out('array').length > 0)) {
			continue;
		}
		const existing = state.attendants;
		if (!existing || existing.length === 0) {
			state.attendants = items;
			confidence.push(0.15);
		} else {
			for (const n of items) {
				if (!existing.some((a) => a.toLowerCase() === n.toLowerCase())) {
					existing.push(n);
				}
			}
		}
		withSpan = { text: m[0], end: (m.index ?? 0) + m[0].length };
		break;
	}

	// A "with"-list that runs to the end of the title (everything after it
	// is schedule) is attendance, not the event name: blank it so the title
	// never carries it. Mid-title lists keep their pin.
	if (withSpan) {
		let tail = nonUrlText.slice(withSpan.end);
		for (const phrase of [...recurrencePhrases, ...stripSpans]) {
			tail = tail.replace(new RegExp(escapeRegExp(phrase), 'i'), ' ');
		}
		if (/^[\s.,;:!-]*$/.test(tail)) {
			nonUrlText = nonUrlText.replace(new RegExp(escapeRegExp(withSpan.text), 'i'), '  ');
		}
	}

	// "invite X" / "invite Jay and Mo" — explicit beats guessed. Reads the
	// claim-masked text so a claimed date beside the names is not a name.
	const inviteMatch = claimMasked.match(/\binvite\s+([^,.]+)/i);
	if (inviteMatch) {
		const raw = inviteMatch[1]
			.replace(/\s+(?:on|at|for|from|to|until|remind|reminder)\b.*$/i, '')
			.trim();
		const names = raw
			.split(/\s+and\s+|,/i)
			.map((n) => n.trim())
			.filter((n) => n.length > 0);
		if (names.length > 0) {
			const merged = [...(state.attendants ?? [])];
			for (const n of names) {
				if (!merged.some((m) => m.toLowerCase() === n.toLowerCase())) merged.push(n);
			}
			state.attendants = merged;
			confidence.push(0.15);
		}
	}

	// Speaker patterns: "Alex and I", "My sister and I", "The team and I"
	const speakerPatterns = [
		/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+I\s+(?:are|will|would|having|hosting|throwing|planning|organizing|going|traveling|performing|reviewing|putting|launching)\b[^.]*/i,
		/(You\s+and\s+I\s+(?:and\s+the\s+rest\s+of\s+)?[^.]+)/i,
		/(Us\s+(?:three\s+)?[a-z]+(?:\s+[A-Z][a-z]+)?(?:\s+and\s+the\s+[a-z]+)?\s+(?:are|will|going|having|hosting|putting))/i,
		/(Our\s+[a-z]+(?:\s+[a-z]+)*\s+and\s+I\s+(?:are|will|having|hosting|throwing|planning|organizing|going|traveling|performing|reviewing))/i,
		/(The\s+[a-z]+(?:\s+[a-z]+)*\s+and\s+I\s+(?:are|will|having|hosting|throwing|planning|organizing|going|traveling|reviewing|clean|having))/i,
		/(My\s+[a-z]+(?:\s+[a-z]+)*\s+and\s+I\s+(?:are|will|having|hosting|throwing|planning|organizing|going|traveling))/i
	];

	if (!state.attendants || state.attendants.length === 0) {
		for (const pattern of speakerPatterns) {
			const match = nonUrlText.match(pattern);
			if (match && match[1] && match[1].length > 3 && match[1].length < 80) {
				const peoplePart = match[1]
					.replace(
						/\s+(are|will|would|having|hosting|throwing|planning|organizing|going|traveling|performing|reviewing|putting|launching|hit|hitting|clean|having|putting)\s*$/i,
						''
					)
					.trim();
				if (peoplePart.length > 3) {
					state.attendants = [peoplePart];
					confidence.push(0.15);
					break;
				}
			}
		}
	}

	// Groups: "including X", "the whole department"
	const groupPatterns = [
		/(?:including|expecting|investors?|about\s+\d+\s+(?:people|attendees?|volunteers?|members?|parents?|chaperones?)|the\s+whole\s+[a-z]+)\s+([^,.]+)/gi
	];

	for (const pattern of groupPatterns) {
		const match = nonUrlText.match(pattern);
		if (match && match[1] && match[1].length > 2 && match[1].length < 60) {
			state.attendants = [match[1].trim()];
			confidence.push(0.1);
			break;
		}
	}

	// Compromise people() last, only when nothing matched — on text with the
	// detected location and any URLs removed, so links/places are not people.
	if (!state.attendants || state.attendants.length === 0) {
		let attendantText = nonUrlText;
		if (state.location) {
			attendantText = rawInput.replace(new RegExp(escapeRegExp(state.location), 'i'), '');
		}
		const people = nlp(attendantText).people().out('array');
		if (people.length > 0) {
			// Short tokens (≤2 chars) are likely abbreviations, not people.
			const filteredPeople = people.filter((p: string) => p.length > 2);
			if (filteredPeople.length > 0) {
				state.attendants = filteredPeople;
				confidence.push(0.15);
			}
		}
	}

	return { confidence, nonUrlText };
}
