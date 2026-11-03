import { json } from '@sveltejs/kit';

/**
 * Reads a JSON object body for an /api endpoint (#292): malformed JSON or a
 * non-object is a `400 {"error":"Invalid JSON"}` instead of a framework 500.
 * An empty body reads as `{}`.
 */
export async function readJsonObject(
	request: Request
): Promise<
	{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }
> {
	const invalid = { ok: false as const, response: json({ error: 'Invalid JSON' }, { status: 400 }) };
	let text: string;
	try {
		text = await request.text();
	} catch {
		return invalid;
	}
	if (!text.trim()) return { ok: true, value: {} };
	try {
		const value: unknown = JSON.parse(text);
		if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid;
		return { ok: true, value: value as Record<string, unknown> };
	} catch {
		return invalid;
	}
}
