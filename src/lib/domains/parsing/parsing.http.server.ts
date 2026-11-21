/**
 * parsing http — the ONE `/api` handler of this module: `POST /api/parse-event`
 * over `parseEventRequest`.
 *
 * The route is anonymous-allowed (`auth: 'optional'`): an Anonymous Account
 * gets the local regex parse and can never reach the vendor, and a signed-in
 * caller's cloud parse is the service's plan-gated branch. The contract
 * (`parsing.contract.ts`) owns the body and the one 400 copy; the service owns
 * the 429 monthly-cap refusal and the 200 fallback shape.
 *
 * Doc: ./README.md#public-interface
 */
import { endpoint, ok, type Endpoint } from '$lib/kernel/http/endpoint.server';
import { clientKeyOf } from '$lib/kernel/ratelimit/rateLimiter';
import { ParseEventBody } from './parsing.contract';
import { parseEventRequest } from './parsing.service.server';

/**
 * The pinned Q-012 accident: legacy read the body with `await request.json()`
 * and destructured it BEFORE its `try` (`+server.ts:66-67`), so malformed JSON
 * rejected with `SyntaxError` and a JSON `null` body with `TypeError` instead
 * of answering the 400 shape. Both are frozen goldens; the owner answered
 * Q-012 B (bad bodies answer 400), which lands as its own commit AFTER S6.
 * Until then this reads a CLONE first, so the endpoint below still parses the
 * unread body itself.
 */
async function rejectUnparseableBody(request: Request): Promise<void> {
	const body: unknown = await request.clone().json();
	if (body === null) throw new TypeError('parse-event: a JSON null body cannot be destructured');
}

const parseEventHandler = endpoint({
	auth: 'optional',
	body: ParseEventBody,
	handle: async ({ ctx, actor, body, event }) =>
		ok(
			await parseEventRequest(ctx, actor, {
				input: body.input,
				useCloud: body.useCloud,
				clientKey: clientKeyOf(event.request, 'parse-event')
			})
		)
});

/**
 * `POST /api/parse-event`: `{input, useCloud?}`, the contract's
 * `400 {"error":"Input required"}`, the service's `429` for the monthly AI cap,
 * and the local parse's 200 shapes (`regex`, `cloud`, `regex-fallback` and the
 * `regex-list` fan-out).
 */
export const submitParseEventEndpoint: Endpoint = {
	auth: 'optional',
	handler: async (event) => {
		await rejectUnparseableBody(event.request);
		return parseEventHandler.handler(event);
	}
};
