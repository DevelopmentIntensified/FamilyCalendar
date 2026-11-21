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
 * `bodyMode: 'lenient'` is the owner's Q-012 answer B. Legacy read the body
 * with `await request.json()` before its `try` (`+server.ts:66-67`), so a
 * malformed JSON body rejected with a `SyntaxError` and a JSON `null` body
 * with a `TypeError` instead of answering the 400 shape. Now every malformed,
 * empty or unreadable body reaches `ParseEventBody` as `null`, so the contract
 * answers its one 400 copy, and a failure below answers the standard 500
 * error JSON through the boundary.
 *
 * Doc: ./README.md#public-interface
 */
import { endpoint, ok } from '$lib/kernel/http/endpoint.server';
import { clientKeyOf } from '$lib/kernel/ratelimit/rateLimiter';
import { ParseEventBody } from './parsing.contract';
import { parseEventRequest } from './parsing.service.server';

/**
 * `POST /api/parse-event`: `{input, useCloud?}`, the contract's
 * `400 {"error":"Input required"}`, the service's `429` for the monthly AI cap,
 * and the local parse's 200 shapes (`regex`, `cloud`, `regex-fallback` and the
 * `regex-list` fan-out).
 */
export const submitParseEventEndpoint = endpoint({
	auth: 'optional',
	bodyMode: 'lenient',
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
