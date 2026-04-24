import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseEventInput } from '$lib/server/services/naturalLanguageService';

export const POST: RequestHandler = async ({ request }) => {
	const { input } = await request.json();

	if (!input || typeof input !== 'string') {
		return json({ error: 'Input required' }, { status: 400 });
	}

	try {
		const result = parseEventInput(input);
		return json(result);
	} catch (error) {
		console.error('Parse error:', error);
		return json({ parsed: null, confidence: 0, error: 'Failed to parse input' }, { status: 500 });
	}
};