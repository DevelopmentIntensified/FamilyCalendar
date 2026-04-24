import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseEventInput } from '$lib/server/services/naturalLanguageService';

export const POST: RequestHandler = async ({ request }) => {
	const { input, useCloud = true, useLocal = true } = await request.json();

	if (!input || typeof input !== 'string') {
		return json({ error: 'Input required' }, { status: 400 });
	}

	try {
		let result = { parsed: null, confidence: 0, method: 'none' };
		
		// 1. Try cloud AI (Cerebras) - default
		if (useCloud) {
			try {
				const apiKey = process.env.CEREBRAS_API_KEY;
				const apiUrl = process.env.CEREBRAS_API_URL || 'https://api.cerebras.ai/v1/chat/completions';
				
				if (apiKey) {
					const cloudRes = await fetch(apiUrl, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'Authorization': `Bearer ${apiKey}`
						},
						body: JSON.stringify({
							model: 'llama-3.3-70b',
							messages: [
								{ role: 'system', content: 'Parse this calendar event. Return JSON with: title, date (YYYY-MM-DD), startTime (HH:MM), endTime (HH:MM), location, description, allDay (boolean), attendants (array of names).' },
								{ role: 'user', content: input }
							],
							response_format: { type: 'json_object' }
						})
					});
					
					if (cloudRes.ok) {
						const cloudData = await cloudRes.json();
						const parsed = JSON.parse(cloudData.choices?.[0]?.message?.content || '{}');
						if (parsed.title || parsed.date) {
							result = { parsed, confidence: 0.85, method: 'cloud' };
						}
					}
				}
			} catch (e) {
				console.log('Cloud AI error');
			}
		}
		
		// 2. Regex fallback 
		if (!result.parsed) {
			result = { ...parseEventInput(input), method: 'regex' };
		}
		
		return json(result);
	} catch (error) {
		console.error('Parse error:', error);
		return json({ ...parseEventInput(input), method: 'regex-fallback' });
	}
};