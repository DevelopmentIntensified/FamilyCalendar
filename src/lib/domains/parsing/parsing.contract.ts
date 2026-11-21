/**
 * parsing contract — the wire for `POST /api/parse-event` only.
 *
 * The route is anonymous-allowed, takes `{input, useCloud?}` and answers
 * either one parse or a list. Both coercions are the legacy ones: a blank,
 * absent or non-string `input` is the one 400; `useCloud` is a TRUTHINESS
 * flag that defaults to true only when the key is absent (a JSON `null` is
 * therefore false).
 *
 * The parsed object is deliberately NOT described field by field: the cloud
 * path passes the vendor's JSON through verbatim (the route only checks
 * `parsed.title || parsed.date`), so a strict schema here would filter or
 * reshape the wire. `ParsedEvent` in `parsing.event.rules.ts` is the local
 * shape; this file stays permissive where the vendor answers.
 */
import { z } from '$lib/kernel/validation/validators';

/** The one 400 body the route uses for every invalid input. */
export const PARSE_EVENT_INVALID_MESSAGE = 'Input required';

/**
 * `POST /api/parse-event`. `input` must be a non-blank string; the parse
 * itself sees the raw string, untrimmed. `useCloud` absent ⇒ true, otherwise
 * its truthiness decides (`null` is false).
 */
export const ParseEventBody = z.object(
	{
		input: z
			.string({ error: PARSE_EVENT_INVALID_MESSAGE })
			.refine((value) => value.trim().length > 0, { error: PARSE_EVENT_INVALID_MESSAGE }),
		useCloud: z.preprocess((value) => (value === undefined ? true : Boolean(value)), z.boolean())
	},
	{ error: PARSE_EVENT_INVALID_MESSAGE }
);
export type ParseEventBody = z.infer<typeof ParseEventBody>;

/**
 * One parsed event as it crosses the wire. Open on purpose: the cloud answer
 * is the vendor's JSON object, including whichever keys it chose, and no
 * response schema may filter, rename or reshape it.
 */
export const ParseEventParsed = z.record(z.string(), z.unknown());
export type ParseEventParsed = z.infer<typeof ParseEventParsed>;

/** `{parsed, confidence, method}` — a single-event answer. */
export const ParseEventResponse = z.object({
	parsed: z.union([ParseEventParsed, z.null()]),
	confidence: z.number(),
	method: z.enum(['regex', 'cloud', 'regex-fallback'])
});
export type ParseEventResponse = z.infer<typeof ParseEventResponse>;

/** One entry of a multi-event answer: the same pair without a method. */
export const ParseEventListItem = z.object({
	parsed: z.union([ParseEventParsed, z.null()]),
	confidence: z.number()
});
export type ParseEventListItem = z.infer<typeof ParseEventListItem>;

/** `{results, method:"regex-list"}` — one entry per named event. */
export const ParseEventListResponse = z.object({
	results: z.array(ParseEventListItem),
	method: z.literal('regex-list')
});
export type ParseEventListResponse = z.infer<typeof ParseEventListResponse>;

/** Either successful answer shape. */
export type ParseEventWireResponse = ParseEventResponse | ParseEventListResponse;
