import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseEventInput } from '$lib/server/services/naturalLanguageService';

export const POST: RequestHandler = async ({ request }) => {
	const { input, useCloud = true, useLocal = true } = await request.json();

	if (!input || typeof input !== 'string') {
		return json({ error: 'Input required' }, { status: 400 });
	}

	try {
		// Hierarchical fallback: Cloud AI -> Local AI -> Regex
		let result = { parsed: null, confidence: 0, method: 'none' };
		
		// 1. Try cloud AI first (if enabled)
		if (useCloud) {
			try {
				const cloudRes = await fetch(process.env.CEREBRAS_API_URL || 'https://api.cerebras.ai/v1/chat/completions', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY || ''}`
					},
					body: JSON.stringify({
						model: 'llama-3.3-70b',
						messages: [{
							role: 'system',
							content: 'Parse this calendar event. Return JSON with: title, date (YYYY-MM-DD), startTime (HH:MM), endTime (HH:MM), location, description, allDay (boolean), attendants (array of names).'
						}, {
							role: 'user',
							content: input
						}],
						response_format: { type: 'json_object' }
					})
				});
				
				if (cloudRes.ok) {
					const cloudData = await cloudRes.json();
					const parsedContent = JSON.parse(cloudData.choices?.[0]?.message?.content || '{}');
					result = { parsed: parsedContent, confidence: 0.9, method: 'cloud' };
				}
			} catch (cloudError) {
				console.log('Cloud AI failed, trying local...');
			}
		}
		
		// 2. Try local AI if cloud failed or disabled
		if (!result.parsed && useLocal) {
			// Try local model (Ollama, etc.) - experimental
			try {
				// TODO: Implement local model call
				// For now, skip to regex
			} catch (localError) {
				console.log('Local AI not available, using regex...');
			}
		}
		
		// 3. Fall back to regex parser
		if (!result.parsed) {
			const regexResult = parseEventInput(input);
			result = { ...regexResult, method: 'regex' };
		}
		
		return json(result);
	} catch (error) {
		console.error('Parse error:', error);
		// Last resort: regex only
		const result = parseEventInput(input);
		return json({ ...result, method: 'regex-fallback' });
	}
};