// Single Adapter for JSON-mode chat completions. Callers get a parsed
// object or null; provider, model, key resolution, and error modes live here.
const MODEL = 'llama-3.3-70b';
const DEFAULT_API_URL = 'https://api.cerebras.ai/v1/chat/completions';

export function llmConfigured(): boolean {
	return !!process.env.CEREBRAS_API_KEY;
}

export async function chatJson(system: string, user: string): Promise<Record<string, any> | null> {
	const apiKey = process.env.CEREBRAS_API_KEY;
	if (!apiKey) return null;

	try {
		const res = await fetch(process.env.CEREBRAS_API_URL || DEFAULT_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`
			},
			body: JSON.stringify({
				model: MODEL,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user }
				],
				response_format: { type: 'json_object' }
			})
		});
		if (!res.ok) return null;

		const data = await res.json();
		const content = data.choices?.[0]?.message?.content;
		if (typeof content !== 'string') return null;
		return JSON.parse(content);
	} catch {
		return null;
	}
}
