// Single Adapter for JSON-mode chat completions. Callers get a parsed
// object or null; provider, model, key resolution, and error modes live here.
const MODEL = process.env.CEREBRAS_MODEL || 'gpt-oss-120b';
const DEFAULT_API_URL = 'https://api.cerebras.ai/v1/chat/completions';

export function llmConfigured(): boolean {
	return !!process.env.CEREBRAS_API_KEY;
}

/** Any value JSON.parse can produce — callers must validate before trusting. */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

/** True when the completion payload carries string message content. */
function isStringContent(content: unknown): content is string {
	return typeof content === 'string';
}

export async function chatJson(
	system: string,
	user: string
): Promise<Record<string, JsonValue> | null> {
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
		if (!res.ok) {
			const text = await res
				.text()
				.then((t) => t.slice(0, 200))
				.catch(() => '');
			console.error('[llm] request failed:', res.status, text);
			return null;
		}

		const data = await res.json();
		const content = data.choices?.[0]?.message?.content;
		if (!isStringContent(content)) return null;
		return JSON.parse(content);
	} catch {
		return null;
	}
}
