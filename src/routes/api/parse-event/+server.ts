import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseEventInput, type ParsedEvent } from '$lib/server/services/naturalLanguageService';
import { chatJson, llmConfigured } from '$lib/server/services/llm';
import { reportUnmatchedPhrase } from '$lib/server/db/actions/unmatchedPhrases';
import { getUserZone } from '$lib/server/utils/userTimezone';

// Below this the regex fallback likely missed the intent — log for the
// parsing library so admins can add the pattern.
const WEAK_PARSE_CONFIDENCE = 0.4;

const PARSE_SYSTEM_PROMPT = `Parse this calendar event. Return JSON with: title, date (YYYY-MM-DD), startTime (HH:MM), endTime (HH:MM), location, description, allDay (boolean), attendants (array of names).

IMPORTANT RULES:
- Location: places, buildings, rooms, addresses, venues (e.g. "LU", "Conference A", "Main Hall", "123 Main St")
- Attendants: ONLY actual people's names. Do NOT treat location names, building names, room names, or venue names as attendants.
- If a word could be either a location or a person, prefer location.
- Short uppercase tokens (like "LU", "NYC", "USA", "HR", "IT") are locations, not people.`;

type ParseOutcome = {
	parsed: Partial<ParsedEvent> | Record<string, any> | null;
	confidence: number;
	method: string;
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { input, useCloud = true, useLocal = true } = await request.json();

	if (!input || typeof input !== 'string') {
		return json({ error: 'Input required' }, { status: 400 });
	}

	// Relative dates ("tomorrow", "next friday") resolve in the user's zone.
	const zone = locals.user ? await getUserZone(locals.user.id) : undefined;

	try {
		let result: ParseOutcome = { parsed: null, confidence: 0, method: 'none' };

		// 1. Cloud AI - default
		if (useCloud && llmConfigured()) {
			const parsed = await chatJson(
				PARSE_SYSTEM_PROMPT,
				zone ? `${input}\n(The user's timezone is ${zone}.)` : input
			);
			if (parsed && (parsed.title || parsed.date)) {
				result = { parsed, confidence: 0.85, method: 'cloud' };
			}
		}

		// 2. Regex fallback
		if (!result.parsed) {
			result = { ...parseEventInput(input, zone), method: 'regex' };
		}

		if (result.method !== 'cloud' && result.confidence < WEAK_PARSE_CONFIDENCE) {
			await reportUnmatchedPhrase('event_parse', input);
		}

		return json(result);
	} catch (error) {
		console.error('Parse error:', error);
		return json({ ...parseEventInput(input, zone), method: 'regex-fallback' });
	}
};