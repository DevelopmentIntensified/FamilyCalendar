/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unknown-parameters, anti-slop/no-known-value-widening -- test doubles: `as never` request fakes and capture-bag bodies; the route under test validates every field. */
import { describe, it, expect, vi } from 'vitest';
import { POST, type ParseReceiptTextDeps } from './+server';
import type { JsonValue } from '$lib/server/services/llm';

/** Valid LLM-shaped completion payload for the happy path. */
const LLM_PAYLOAD: JsonValue = {
	merchant: 'Whole Foods',
	total: 23.45,
	date: '2026-09-06',
	lineItems: [{ label: 'Organic Milk', price: 4.99 }]
};

function deps(over: Partial<ParseReceiptTextDeps> = {}): ParseReceiptTextDeps {
	return {
		chatJson: vi.fn(async () => LLM_PAYLOAD as { [key: string]: JsonValue }),
		llmConfigured: () => true,
		getUseCloudAI: async () => true,
		allowRequest: () => true,
		...over
	};
}

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- test double: the handler only reads locals.user and request.json().
function event(userId: string | null, body?: Record<string, unknown>) {
	return {
		locals: { user: userId ? { id: userId } : null },
		request: {
			json: async () => body
		}
	} as never;
}

describe('POST /api/parse-receipt-text', () => {
	it('401s without a user', async () => {
		const res = await POST(event(null, { text: 'Kroger\nTOTAL $5.00' }), deps());
		expect(res.status).toBe(401);
	});

	it('400s on missing or non-string text', async () => {
		const res = await POST(event('u1', {}), deps());
		expect(res.status).toBe(400);
		const bad = await POST(event('u1', { text: 42 }), deps());
		expect(bad.status).toBe(400);
	});

	it('400s over the 20KB text cap', async () => {
		const res = await POST(event('u1', { text: 'a'.repeat(20 * 1024 + 1) }), deps());
		expect(res.status).toBe(400);
	});

	it('extracts via the LLM when configured and cloud AI is allowed', async () => {
		const chatJson = vi.fn(async () => LLM_PAYLOAD as { [key: string]: JsonValue });
		const res = await POST(event('u1', { text: 'Whole Foods\nTOTAL $23.45' }), deps({ chatJson }));

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.draft.source).toBe('llm');
		expect(body.draft.merchant).toBe('Whole Foods');
		expect(body.draft.items[0]).toMatchObject({ label: 'Organic Milk', priceCents: 499 });
		expect(body.draft.totalCents).toBe(2345);
	});

	it('falls back to the regex extractor when the LLM returns garbage', async () => {
		const chatJson = vi.fn(async () => null);
		const res = await POST(
			event('u1', { text: 'KROGER #4412\nWHOLE MILK 3.49\nTOTAL 15.12' }),
			deps({ chatJson })
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.draft.source).toBe('regex');
		expect(body.draft.merchant).toBe('KROGER #4412');
		expect(body.draft.items[0]).toMatchObject({ label: 'WHOLE MILK', priceCents: 349 });
		expect(body.draft.totalCents).toBe(1512);
	});

	it('skips the LLM when it is not configured', async () => {
		const chatJson = vi.fn();
		const res = await POST(
			event('u1', { text: 'KROGER #4412\nWHOLE MILK 3.49\nTOTAL 15.12' }),
			deps({ chatJson, llmConfigured: () => false })
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(chatJson).not.toHaveBeenCalled();
		expect(body.draft.source).toBe('regex');
	});

	it('skips the LLM when the user opted out of cloud AI', async () => {
		const chatJson = vi.fn();
		const getUseCloudAI = vi.fn(async () => false);
		const res = await POST(
			event('u1', { text: 'KROGER #4412\nWHOLE MILK 3.49\nTOTAL 15.12' }),
			deps({ chatJson, getUseCloudAI })
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(chatJson).not.toHaveBeenCalled();
		expect(getUseCloudAI).toHaveBeenCalledWith('u1');
		expect(body.draft.source).toBe('regex');
	});

	it('429s when rate-limited and never calls the LLM', async () => {
		const chatJson = vi.fn();
		const res = await POST(
			event('u1', { text: 'receipt' }),
			deps({ chatJson, allowRequest: () => false })
		);
		expect(res.status).toBe(429);
		expect(chatJson).not.toHaveBeenCalled();
	});
});
