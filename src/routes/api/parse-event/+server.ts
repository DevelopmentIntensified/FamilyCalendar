import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseEventInput } from '$lib/server/services/naturalLanguageService';

export const POST: RequestHandler = async ({ request }) => {
	const { input, useCloud = true, useLocal = true } = await request.json();

	if (!input || typeof input !== 'string') {
		return json({ error: 'Input required' }, { status: 400 });
	}

	const systemPrompt = `Parse this calendar event. Return JSON with exactly these fields:
- title: string (event name)
- date: string in YYYY-MM-DD format
- startTime: string in HH:MM format
- endTime: string in HH:MM format  
- location: string
- description: string
- allDay: boolean
- attendants: array of names`;

	try {
		let result = { parsed: null, confidence: 0, method: 'none' };
		
		// 1. Try cloud AI first (Cerebras)
		if (useCloud && !result.parsed) {
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
								{ role: 'system', content: systemPrompt },
								{ role: 'user', content: input }
							],
							response_format: { type: 'json_object' }
						})
					});
					
					if (cloudRes.ok) {
						const cloudData = await cloudRes.json();
						const content = cloudData.choices?.[0]?.message?.content || '{}';
						const parsed = JSON.parse(content);
						if (parsed.title || parsed.date) {
							result = { parsed, confidence: 0.85, method: 'cloud' };
						}
					}
				}
			} catch (cloudError) {
				console.log('Cloud AI error:', cloudError);
			}
		}
		
		// 2. Try local AI via Ollama
		if (!result.parsed && useLocal) {
			try {
				const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
				const model = process.env.OLLAMA_MODEL || 'llama3.2:1b';
				
				// Check if Ollama is running
				const healthCheck = await fetch(`${ollamaUrl}/api/tags`, { 
					method: 'GET'
				}).catch(() => null);
				
				if (healthCheck?.ok) {
					const localRes = await fetch(`${ollamaUrl}/api/chat`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							model,
							messages: [
								{ role: 'system', content: systemPrompt },
								{ role: 'user', content: input }
							],
							format: 'json',
							options: {
								temperature: 0.1
							}
						})
					});
					
					if (localRes.ok) {
						const localData = await localRes.json();
						const content = localData.message?.content || '{}';
						const parsed = JSON.parse(content);
						if (parsed.title || parsed.date) {
							result = { parsed, confidence: 0.7, method: 'local' };
						}
					}
				}
			} catch (localError) {
				console.log('Local AI not available:', localError);
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
		const result = parseEventInput(input);
		return json({ ...result, method: 'regex-fallback' });
	}
};