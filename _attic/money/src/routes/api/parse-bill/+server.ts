import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { parseBillQuickAdd } from '$lib/server/services/naturalLanguageService';
import { getUserZone } from '$lib/server/utils/userTimezone';

/** True for a usable quick-add phrase. */
function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Bill quick-add parse (issue 011). Local deterministic regex parser only —
 * no paid LLM, no rate limit needed (parse-event reserves its ceiling for
 * the cloud path). Returns a ParsedBill; the caller decides whether the
 * phrase was bill-ish enough to prefill the create form.
 */
export const POST = async (event: RequestEvent): Promise<Response> => {
	const { request, locals } = event;
	const { input } = await request.json();

	if (!isNonEmptyString(input)) {
		return json({ error: 'Input required' }, { status: 400 });
	}

	// Relative dues ("due friday", "due tomorrow") resolve in the user's zone.
	const zone = locals.user ? await getUserZone(locals.user.id) : undefined;

	return json({ parsed: parseBillQuickAdd(input, zone), method: 'regex' });
};
