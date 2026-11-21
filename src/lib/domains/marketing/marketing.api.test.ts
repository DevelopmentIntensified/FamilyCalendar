/**
 * The contact api: the one request it makes and the two ways it can fail. The
 * body must be `FormData` (the action reads `request.formData()`), and a refusal
 * must surface the wire's own sentence, because the page renders it verbatim.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { createContactApi } from './marketing.api';

type Captured = { input: string; init: RequestInit | undefined };

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function capture(response: () => Response): { seen: Captured[]; fetcher: typeof fetch } {
	const seen: Captured[] = [];
	const fetcher = (input: string, init?: RequestInit) => {
		seen.push({ input, init });
		return Promise.resolve(response());
	};
	return { seen, fetcher: fetcher as unknown as typeof fetch };
}

const fields = { name: 'Alex', email: 'alex@example.com', message: 'Hi there', website: '' };

describe('createContactApi', () => {
	it('posts a FormData body to /api/contact', async () => {
		const { seen, fetcher } = capture(() => jsonResponse(200, { success: true }));

		const result = await createContactApi(fetcher).send(fields);

		expect(result).toEqual({ ok: true, data: { success: true } });
		expect(seen).toHaveLength(1);
		expect(seen[0].input).toBe('/api/contact');
		expect(seen[0].init?.method).toBe('POST');
		const body = seen[0].init?.body;
		expect(body).toBeInstanceOf(FormData);
		const form = body as FormData;
		expect(form.get('name')).toBe('Alex');
		expect(form.get('email')).toBe('alex@example.com');
		expect(form.get('message')).toBe('Hi there');
		expect(form.get('website')).toBe('');
	});

	it('shows the wire sentence when the action refuses', async () => {
		const { fetcher } = capture(() => jsonResponse(400, { error: 'All fields are required' }));

		const result = await createContactApi(fetcher).send(fields);

		expect(result).toEqual({ ok: false, status: 400, error: 'All fields are required' });
	});

	it('shows the throttle sentence on a 429', async () => {
		const { fetcher } = capture(() =>
			jsonResponse(429, { error: 'Too many attempts. Try again shortly.' })
		);

		const result = await createContactApi(fetcher).send(fields);

		expect(result).toEqual({
			ok: false,
			status: 429,
			error: 'Too many attempts. Try again shortly.'
		});
	});

	it('reports a failed fetch instead of throwing', async () => {
		const fetcher = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;

		const result = await createContactApi(fetcher).send(fields);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.status).toBe(0);
		expect(result.error.length).toBeGreaterThan(0);
	});
});
