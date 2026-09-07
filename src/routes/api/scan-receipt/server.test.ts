import { describe, it, expect, vi } from 'vitest';
import { POST, type ScanReceiptDeps } from './+server';
import { AzureScanError, type AzureReceiptScan } from '$lib/server/services/azureReceiptService';

function scanFixture(): AzureReceiptScan {
	return {
		merchant: 'City Power & Light',
		merchantConfidence: 0.98,
		totalCents: 12050,
		totalConfidence: 0.95,
		date: '2026-09-05',
		lineItems: [{ label: 'Electric usage', priceCents: 9850, confidence: null }],
		category: 'utilities'
	};
}

function deps(over: Partial<ScanReceiptDeps> = {}): ScanReceiptDeps {
	return {
		config: () => ({ apiKey: 'k', endpoint: 'https://example.cognitiveservices.azure.com' }),
		analyze: vi.fn(async () => scanFixture()),
		allowRequest: () => true,
		...over
	};
}

function event(userId: string | null, request: Request): Parameters<typeof POST>[0] {
	// SAFETY: test double — the handler only reads locals.user and request.
	return { locals: { user: userId ? { id: 'u1' } : null }, request } as never;
}

function imageRequest(file: File | null): Request {
	const form = new FormData();
	if (file) form.set('image', file, file.name);
	return new Request('http://localhost/api/scan-receipt', { method: 'POST', body: form });
}

const JPEG = new File([new Uint8Array(8)], 'r.jpg', { type: 'image/jpeg' });

describe('POST /api/scan-receipt (issue 010 cloud opt-in)', () => {
	it('returns the normalized cloud scan for an authed multipart image', async () => {
		const analyze = vi.fn(async (image: Blob) => {
			void image;
			return scanFixture();
		});
		const res = await POST(event('u1', imageRequest(JPEG)), deps({ analyze }));

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ scan: scanFixture() });
		expect(analyze).toHaveBeenCalledOnce();
		const blob = vi.mocked(analyze).mock.calls[0][0];
		expect(blob).toBeInstanceOf(Blob);
	});

	it('401s without a user', async () => {
		const res = await POST(event(null, imageRequest(JPEG)), deps());
		expect(res.status).toBe(401);
	});

	it('503s with the plain availability message when Azure env vars are absent', async () => {
		const res = await POST(
			event('u1', imageRequest(JPEG)),
			deps({ config: () => ({ apiKey: 'k', endpoint: undefined }) })
		);
		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({ error: 'Cloud scan is not available' });
	});

	it('429s when the rate limit rejects', async () => {
		const res = await POST(event('u1', imageRequest(JPEG)), deps({ allowRequest: () => false }));
		expect(res.status).toBe(429);
		expect((await res.json()).error).toMatch(/Too many/i);
	});

	it('400s on a missing image part', async () => {
		const res = await POST(event('u1', imageRequest(null)), deps());
		expect(res.status).toBe(400);
	});

	it('400s on a non-image type', async () => {
		const pdf = new File([new Uint8Array(4)], 'r.pdf', { type: 'application/pdf' });
		const res = await POST(event('u1', imageRequest(pdf)), deps());
		expect(res.status).toBe(400);
	});

	it('400s on an image over 10MB', async () => {
		const big = new File([new ArrayBuffer(10 * 1024 * 1024 + 1)], 'big.jpg', {
			type: 'image/jpeg'
		});
		const res = await POST(event('u1', imageRequest(big)), deps());
		expect(res.status).toBe(400);
	});

	it('502s with the plain AzureScanError message (no key leak)', async () => {
		const analyze = vi.fn(async () => {
			throw new AzureScanError('Cloud scan failed (Azure returned 429).');
		});
		const res = await POST(event('u1', imageRequest(JPEG)), deps({ analyze }));

		expect(res.status).toBe(502);
		const body = await res.json();
		expect(body.error).toBe('Cloud scan failed (Azure returned 429).');
	});

	it('502s with a generic message when the service throws unexpectedly', async () => {
		const analyze = vi.fn(async () => {
			throw new TypeError('cannot read properties of undefined');
		});
		const res = await POST(event('u1', imageRequest(JPEG)), deps({ analyze }));

		expect(res.status).toBe(502);
		expect(await res.json()).toEqual({ error: 'Cloud scan failed. Try again.' });
	});
});
