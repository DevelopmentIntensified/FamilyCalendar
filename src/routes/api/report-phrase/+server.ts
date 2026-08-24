import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { reportUnmatchedPhrase, type UnmatchedSource } from '$lib/server/db/actions/unmatchedPhrases';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';

const SOURCES: UnmatchedSource[] = ['event_parse', 'bulk_edit'];

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!rateLimit(clientKey(request, 'report-phrase'), 20, 5 * 60 * 1000)) {
		return json({ error: 'Too many reports. Try again shortly.' }, { status: 429 });
	}

	const body = await request.json().catch(() => ({} as Record<string, unknown>));
	const phrase = typeof body.phrase === 'string' ? body.phrase.trim() : '';
	const source = body.source as UnmatchedSource;

	if (!phrase || phrase.length > 280 || !SOURCES.includes(source)) {
		return json({ error: 'phrase (string) and source (event_parse | bulk_edit) are required' }, { status: 400 });
	}

	await reportUnmatchedPhrase(source, phrase);
	return json({ success: true });
};
