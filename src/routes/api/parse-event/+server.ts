import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { parseEventInput, parseEventList } from '$lib/server/services/naturalLanguageService';
import { chatJson, llmConfigured } from '$lib/server/services/llm';
import { getUserZone } from '$lib/server/utils/userTimezone';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';

/**
 * Collaborators POST needs, injectable so tests can pass fakes through a real
 * seam instead of mocking modules. Defaults wire the production services.
 */
export type ParseEventDeps = {
	chatJson: typeof chatJson;
	llmConfigured: typeof llmConfigured;
};

const defaultDeps: ParseEventDeps = { chatJson, llmConfigured };

const PARSE_SYSTEM_PROMPT = `Parse this calendar event. Return JSON with: title, date (YYYY-MM-DD), startTime (HH:MM), endTime (HH:MM), location, description, allDay (boolean), attendants (array of names).

IMPORTANT RULES:
- Location: places, buildings, rooms, addresses, venues (e.g. "LU", "Conference A", "Main Hall", "123 Main St")
- Attendants: ONLY actual people's names. Do NOT treat location names, building names, room names, or venue names as attendants.
- If a word could be either a location or a person, prefer location.
- Short uppercase tokens (like "LU", "NYC", "USA", "HR", "IT") are locations, not people.`;

/** Outcome of one parse attempt: parsed fields, confidence, and which path produced it. */
type ParseOutcome = {
	parsed: Awaited<ReturnType<typeof chatJson>>;
	confidence: number;
	method: string;
};

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

export const POST = async (
	event: RequestEvent,
	deps: ParseEventDeps = defaultDeps
): Promise<Response> => {
	const { request, locals } = event;
	const { input, useCloud = true } = await request.json();

	if (!isNonEmptyString(input)) {
		return json({ error: 'Input required' }, { status: 400 });
	}

	// Relative dates ("tomorrow", "next friday") resolve in the user's zone.
	const zone = locals.user ? await getUserZone(locals.user.id) : undefined;

	// Paid-LLM abuse guard: anonymous callers NEVER reach the paid API — only
	// the local regex fallback below, regardless of rate-limit headroom (the
	// in-memory limit resets on deploy, so it is not a real ceiling). The
	// cloud path stays available to logged-in users.
	const cloudAllowed =
		Boolean(locals.user) && rateLimit(clientKey(request, 'parse-event'), 20, 5 * 60 * 1000);

	try {
		let result: ParseOutcome = { parsed: null, confidence: 0, method: 'none' };

		// 0. Multi-event shortcut: "dinner Friday and movie Saturday" parses
		// locally per segment — no extra LLM calls, instant.
		const list = parseEventList(input, zone);
		if (list.length > 1) {
			return json({ results: list, method: 'regex-list' });
		}

		// 1. Cloud AI - default
		if (useCloud && cloudAllowed && deps.llmConfigured()) {
			const parsed = await deps.chatJson(
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

		return json(result);
	} catch (error) {
		console.error('Parse error:', error);
		return json({ ...parseEventInput(input, zone), method: 'regex-fallback' });
	}
};
