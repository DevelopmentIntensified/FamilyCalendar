import { describe, it, expect } from 'vitest';
import { POST } from './+server';

function mockEvent(body: { input: unknown }, user?: { id: string }) {
	return (
		// SAFETY: test double — POST only reads request.json() and locals.user.
		{
			request: { json: () => Promise.resolve(body) },
			locals: user ? { user } : {}
		} as never
	);
}

describe('POST /api/parse-bill', () => {
	it('parses a bill phrase with cents at the boundary', async () => {
		const response = await POST(mockEvent({ input: 'electric bill $85 due friday' }));

		const body = await response.json();

		expect(body.method).toBe('regex');
		expect(body.parsed.title).toBe('electric bill');
		expect(body.parsed.amountCents).toBe(8500);
		expect(body.parsed.amount).toBe(85);
		expect(body.parsed.dueDate).toBeDefined();
		expect(body.parsed.category).toBe('utilities');
	});

	it('rejects a blank input', async () => {
		const response = await POST(mockEvent({ input: '   ' }));

		expect(response.status).toBe(400);
	});

	it('rejects a non-string input', async () => {
		const response = await POST(mockEvent({ input: 42 }));

		expect(response.status).toBe(400);
	});
});
