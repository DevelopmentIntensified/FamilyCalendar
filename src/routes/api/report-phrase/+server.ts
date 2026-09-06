import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	reportUnmatchedPhrase,
	type MatchedPayload,
	type UnmatchedSource
} from '$lib/server/db/actions/unmatchedPhrases';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';

function isPhraseReport(value: unknown): value is {
	phrase: unknown;
	source: unknown;
	matched: unknown;
} {
	return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
	return typeof value === 'string';
}

function isUnmatchedSource(value: unknown): value is UnmatchedSource {
	return value === 'event_parse' || value === 'bulk_edit';
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!rateLimit(clientKey(request, 'report-phrase'), 20, 5 * 60 * 1000)) {
		return json({ error: 'Too many reports. Try again shortly.' }, { status: 429 });
	}

	const body: unknown = await request.json().catch(() => null);
	if (!isPhraseReport(body)) {
		return json(
			{ error: 'phrase (string) and source (event_parse | bulk_edit) are required' },
			{ status: 400 }
		);
	}
	const phrase = isString(body.phrase) ? body.phrase.trim() : '';
	const source = isUnmatchedSource(body.source) ? body.source : null;
	// SAFETY: MatchedPayload is a recursive JSON shape; the client posts JSON
	// and this endpoint forwards it verbatim to the report action.
	const matched = (body.matched ?? null) as MatchedPayload | null;

	if (!phrase || phrase.length > 280 || source === null) {
		return json(
			{ error: 'phrase (string) and source (event_parse | bulk_edit) are required' },
			{ status: 400 }
		);
	}

	await reportUnmatchedPhrase(source, phrase, matched);
	return json({ success: true });
};
