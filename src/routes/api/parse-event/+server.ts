import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { parseEventInput, parseEventList } from '$lib/server/services/naturalLanguageService';
import { chatJson, llmConfigured } from '$lib/server/services/llm';
import {
	canUseAiFeature,
	getUserSubscription,
	recordAiUsage
} from '$lib/server/services/subscriptionService';
import { getUserZone } from '$lib/server/utils/userTimezone';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';

/**
 * Collaborators POST needs, injectable so tests can pass fakes through a real
 * seam instead of mocking modules. Defaults wire the production services.
 */
export type ParseEventDeps = {
	chatJson: typeof chatJson;
	llmConfigured: typeof llmConfigured;
	canUseAiFeature: typeof canUseAiFeature;
	getUserSubscription: typeof getUserSubscription;
	recordAiUsage: typeof recordAiUsage;
};

const defaultDeps: ParseEventDeps = {
	chatJson,
	llmConfigured,
	canUseAiFeature,
	getUserSubscription,
	recordAiUsage
};

/**
 * Short-window cloud-parse budget per client (issue 317). Free callers keep
 * today's 20/5min; paid tiers get 3x. Going over is silent — the request
 * falls back to the local regex parser, never a 429, so the monthly AI cap
 * below stays the only user-facing refusal.
 */
const PARSE_RATE_WINDOW_MS = 5 * 60 * 1000;
const FREE_PARSE_LIMIT = 20;
const PAID_PARSE_LIMIT = FREE_PARSE_LIMIT * 3;

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
	// The short-window budget is plan-aware (issue 317): the tier the
	// subscription read model already returns decides free vs paid. The tier
	// lookup runs only for a signed-in caller that asked for cloud parsing, so
	// anonymous and opt-out requests add no query.
	let cloudAllowed = false;
	if (locals.user && useCloud) {
		const tier = await deps.getUserSubscription(locals.user.id);
		const limit = tier && tier.tierName !== 'free' ? PAID_PARSE_LIMIT : FREE_PARSE_LIMIT;
		cloudAllowed = rateLimit(clientKey(request, 'parse-event'), limit, PARSE_RATE_WINDOW_MS);
	}
	// The cloud path is reachable only for authenticated callers (cloudAllowed
	// above), so userId is non-null whenever the cap check / usage record runs.
	const userId = locals.user?.id ?? null;

	try {
		let result: ParseOutcome = { parsed: null, confidence: 0, method: 'none' };

		// 0. Multi-event shortcut: "dinner Friday and movie Saturday" parses
		// locally per segment — no extra LLM calls, instant.
		const list = parseEventList(input, zone);
		if (list.length > 1) {
			return json({ results: list, method: 'regex-list' });
		}

		// 1. Cloud AI - default. The monthly AI spend cap is checked BEFORE the
		// vendor request (issue 187): an over-cap caller gets a clean refusal
		// and the Cerebras API is never hit.
		if (useCloud && cloudAllowed && deps.llmConfigured()) {
			if (userId) {
				const cap = await deps.canUseAiFeature(userId);
				if (!cap.allowed) {
					return json({ error: cap.reason ?? 'AI usage limit reached' }, { status: 429 });
				}
			}
			const parsed = await deps.chatJson(
				PARSE_SYSTEM_PROMPT,
				zone ? `${input}\n(The user's timezone is ${zone}.)` : input
			);
			// Billed call happened — count it against the month's cap. The vendor
			// charges for the request whether or not it yields a usable parse, so
			// usage is recorded even when chatJson comes back null (issue 187).
			if (userId) await deps.recordAiUsage(userId);
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
