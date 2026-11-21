/**
 * calendar locations: the event form's place search, proxied to Nominatim.
 *
 * Ported from `api/location-search/+server.ts`. The rule is the legacy one:
 * sign-in is the endpoint's job, then 60 searches a minute per client (before
 * the query is even read, so a burst that never reaches the network still
 * spends its budget), then a 2–100 character query. Upstream trouble — a
 * non-ok status, a network failure, a timeout, a body that is not the array
 * Nominatim documents — is an empty list, never an error: the form stays
 * usable with a manually typed place.
 *
 * The outbound call is the kernel `Http` port, so no service touches `fetch`,
 * and the `User-Agent` is the configured one (the legacy literal).
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { invalid, tooMany } from '$lib/kernel/errors/appError';
import { z } from '$lib/kernel/validation/validators';
import { CALENDAR_COPY } from './calendar.contract';

/** One place suggestion, exactly as the form's dropdown reads it. */
export type CalendarLocationResult = {
	readonly results: readonly {
		readonly label: string;
		readonly lat: string;
		readonly lon: string;
	}[];
};

/** The limit and its window, legacy verbatim. */
export const CALENDAR_LOCATION_SEARCH_LIMIT = 60;
export const CALENDAR_LOCATION_SEARCH_WINDOW_MS = 60_000;
/** Nominatim's own timeout in the legacy handler. */
const LOCATION_SEARCH_TIMEOUT_MS = 10_000;

/** The one upstream row shape the map trusts; anything else is a failure. */
const NominatimRow = z.object({
	display_name: z.string(),
	lat: z.string(),
	lon: z.string()
});

/**
 * `GET /api/location-search`. `clientKey` is the per-client limiter key
 * (`location-search:<ip>`), computed by the caller from the request.
 */
export async function searchLocations(
	ctx: Ctx,
	_actor: Actor,
	input: { readonly q: string; readonly clientKey: string }
): Promise<CalendarLocationResult> {
	if (
		!ctx.limiter.allow(
			input.clientKey,
			CALENDAR_LOCATION_SEARCH_LIMIT,
			CALENDAR_LOCATION_SEARCH_WINDOW_MS
		)
	) {
		throw tooMany(CALENDAR_COPY.searchRateLimited);
	}

	const q = input.q.trim();
	if (q.length < 2 || q.length > 100) throw invalid(CALENDAR_COPY.searchQueryInvalid);

	try {
		const response = await ctx.http.request({
			url:
				'https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=5&q=' +
				encodeURIComponent(q),
			headers: { 'User-Agent': ctx.config.userAgent },
			timeoutMs: LOCATION_SEARCH_TIMEOUT_MS
		});
		if (!response.ok) return { results: [] };

		const parsed = z.array(NominatimRow).safeParse(JSON.parse(response.body));
		if (!parsed.success) return { results: [] };
		return {
			results: parsed.data.map((row) => ({
				label: row.display_name,
				lat: row.lat,
				lon: row.lon
			}))
		};
	} catch {
		return { results: [] };
	}
}
