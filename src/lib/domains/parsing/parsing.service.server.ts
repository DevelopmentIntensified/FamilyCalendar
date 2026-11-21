/**
 * parsing service — `POST /api/parse-event` as one use-case: the local parse
 * first, then the signed-in-only, plan-gated cloud parse, then the wire answer.
 *
 * The order is the legacy route's (`src/routes/api/parse-event/+server.ts:
 * 60-137`), because the frozen golden pins every branch of it: the multi-event
 * shortcut runs BEFORE the cloud path (Q-013 A), an Anonymous Account never
 * spends vendor money, the monthly cap refuses with 429 before any vendor
 * call, and a throw after a successful parse still answers the 200
 * `regex-fallback` wire (Q-011 A) while the failure is reported.
 *
 * Cross-module reads go through the callee's public server entry and only to
 * lower ranks (R1): identity for the caller's stored zone, billing for the
 * paid tier, the monthly AI cap and the usage record. The vendor call goes
 * through the kernel `ai` port (`ctx.ai`), so no test leaves the process and no
 * module imports Cerebras.
 *
 * `now` for the parse is the PROCESS clock (`systemClock`, kernel/time), not
 * `ctx.clock`: the frozen golden derives its expected dates from
 * `DateTime.now()` (`parsing.http.db.test.ts`), so the endpoint must resolve
 * relative dates against the same real clock the legacy route read (R5 still
 * holds — the read goes through kernel/time, never `DateTime.now()` here).
 * Billing's period and the free tier's short window still follow `ctx.clock`.
 *
 * Doc: ./README.md#public-interface
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { isAppError } from '$lib/kernel/errors/appError';
import { systemClock } from '$lib/kernel/time/clock';
import {
	assertAiAvailable,
	isPaidCaller,
	recordAiCreation
} from '$lib/domains/billing/index.server';
import { getTimeZone } from '$lib/domains/identity/index.server';
import type { ParseEventListItem, ParseEventWireResponse } from './parsing.contract';
import {
	parseEventQuickAdd,
	parseEventQuickAddList,
	type EventQuickAddOptions,
	type EventQuickAddResult
} from './parsing.event.rules';

/**
 * Short-window cloud budget per client (issue 317): a free caller gets 20
 * parses per 5 minutes, a paid tier skips the window entirely. Going over is
 * SILENT — the request falls back to the local parser, never a 429, so the
 * monthly cap below stays the only user-facing refusal.
 */
const PARSE_RATE_WINDOW_MS = 5 * 60 * 1000;
const FREE_PARSE_LIMIT = 20;

/**
 * The parse's confidence for a vendor answer (the legacy `0.85`); a local
 * answer carries the confidence the rule chain accumulated.
 */
const CLOUD_CONFIDENCE = 0.85;

/** This service has one caller, so a fault report can name its path. */
const PARSE_EVENT_PATH = '/api/parse-event';

/**
 * The cloud model's system prompt, verbatim from the legacy route: it is part
 * of the parse contract (it names every field the clients read), not copy.
 */
const PARSE_SYSTEM_PROMPT = `Parse this calendar event. Return JSON with: title, date (YYYY-MM-DD), startTime (HH:MM), endTime (HH:MM), location, description, allDay (boolean), attendants (array of names).

IMPORTANT RULES:
- Location: places, buildings, rooms, addresses, venues (e.g. "LU", "Conference A", "Main Hall", "123 Main St")
- Attendants: ONLY actual people's names. Do NOT treat location names, building names, room names, or venue names as attendants.
- If a word could be either a location or a person, prefer location.
- Short uppercase tokens (like "LU", "NYC", "USA", "HR", "IT") are locations, not people.`;

/** One `/api/parse-event` request, as `parsing.contract.ts` validates it. */
export type ParseEventServiceInput = {
	/** The phrase, raw and untrimmed (leading/trailing space is the user's). */
	readonly input: string;
	/** The wire's truthiness flag: absent ⇒ true, `null` ⇒ false (the contract decides). */
	readonly useCloud: boolean;
	/**
	 * `clientKeyOf(request, 'parse-event')` — the free tier's short-window
	 * bucket, built by the caller so the service takes no Request.
	 */
	readonly clientKey: string;
};

/** One local parse on the wire: `{parsed, confidence, method}` and nothing else. */
function singleAnswer(
	result: EventQuickAddResult,
	method: 'regex' | 'regex-fallback'
): ParseEventWireResponse {
	return { parsed: result.parsed, confidence: result.confidence, method };
}

/** One list entry: the parse pair without a method (the answer carries it). */
function listItem(result: EventQuickAddResult): ParseEventListItem {
	return { parsed: result.parsed, confidence: result.confidence };
}

/**
 * A throw AFTER the parse succeeded keeps the 200 wire (Q-011 A) but must not
 * vanish: the log line and the fault report are how it stays visible.
 */
function reportFallback(ctx: Ctx, actor: Actor | null, cause: unknown): void {
	const message = cause instanceof Error ? cause.message : String(cause);
	const userId = actor?.id ?? null;
	ctx.log.error('parse_event_fallback', { message, userId });
	ctx.faults.report({ status: 500, message, path: PARSE_EVENT_PATH, userId });
}

/**
 * Parse one quick-add phrase for `actor` (null = Anonymous Account) and answer
 * the wire shape. Nothing is written except the AI counter's usage row, and
 * only when a vendor call actually happened.
 */
export async function parseEventRequest(
	ctx: Ctx,
	actor: Actor | null,
	input: ParseEventServiceInput
): Promise<ParseEventWireResponse> {
	// The zone read sits before the boundary, as legacy's did: relative dates
	// resolve in the caller's stored zone, else UTC (what production's
	// server-local clock is), so the rule always gets a zone (R5).
	const storedZone = actor ? await getTimeZone(ctx, actor.id) : undefined;
	const options: EventQuickAddOptions = { now: systemClock.now(), zone: storedZone ?? 'UTC' };

	// The tier lookup runs only for a signed-in caller that asked for cloud
	// parsing, so anonymous and opt-out requests add no query. The window is
	// consumed only by a free caller (paid tiers are uncapped in it).
	let cloudAllowed = false;
	if (actor && input.useCloud) {
		cloudAllowed =
			(await isPaidCaller(ctx, actor)) ||
			ctx.limiter.allow(input.clientKey, FREE_PARSE_LIMIT, PARSE_RATE_WINDOW_MS);
	}

	try {
		// 0. Multi-event shortcut: parsed locally per segment, never billed.
		const list = parseEventQuickAddList(input.input, options);
		if (list.length > 1) {
			return { results: list.map(listItem), method: 'regex-list' };
		}

		// 1. Cloud parse: signed-in, allowed, configured — and inside the cap.
		if (input.useCloud && cloudAllowed && actor && ctx.ai.configured()) {
			// Refuses with 429 before the vendor call, so an over-cap caller
			// costs nothing (issue 187).
			await assertAiAvailable(ctx, actor);
			const parsed = await ctx.ai.chatJson(
				PARSE_SYSTEM_PROMPT,
				storedZone ? `${input.input}\n(The user's timezone is ${storedZone}.)` : input.input
			);
			// Billed call happened — count it even when the vendor answered
			// nothing (issue 187: the provider charges for the request).
			await recordAiCreation(ctx, actor);
			if (parsed && (parsed.title || parsed.date)) {
				return { parsed, confidence: CLOUD_CONFIDENCE, method: 'cloud' };
			}
		}

		// 2. Local parse: the single-entry list IS this phrase's parse (the list
		// parser always answers at least one entry).
		const [single] = list;
		if (!single) throw new Error('parse-event: the parse list answered no entry');
		return singleAnswer(single, 'regex');
	} catch (error) {
		// The monthly cap is an EXPECTED refusal: it answers 429, never the
		// silent fallback. Anything else keeps the 200 wire (Q-011 A); a parse
		// that throws AGAIN here has no prefill to answer and stays a 500.
		if (isAppError(error)) throw error;
		const fallback = parseEventQuickAdd(input.input, options);
		reportFallback(ctx, actor, error);
		return singleAnswer(fallback, 'regex-fallback');
	}
}
