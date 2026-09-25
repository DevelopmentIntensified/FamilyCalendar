import { describe, it, expect, vi } from 'vitest';
import { GET, POST } from './+server';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- test double: handlers only read locals.user.
function event(userId: string | null) {
	// SAFETY: test double — the handlers only read locals.user; the cast
	// satisfies the RequestEvent parameter without the full type surface.
	// oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- test-double cast, justified above.
	return { locals: { user: userId ? { id: userId } : null } } as never;
}

function env(over: Record<string, string | undefined> = {}) {
	const original = process.env.RECEIPT_INGEST_DOMAIN;
	Object.entries(over).forEach(([k, v]) => {
		if (v === undefined) delete process.env[k];
		else process.env[k] = v;
	});
	return () => {
		if (original === undefined) delete process.env.RECEIPT_INGEST_DOMAIN;
		else process.env.RECEIPT_INGEST_DOMAIN = original;
	};
}

// oxlint-disable-next-line anti-slop/no-module-mocking -- the ingest-address actions read the DB directly; mocking IS the seam (the route has no deps parameter).
vi.mock('$lib/server/db/actions/receiptIngest', () => ({
	getOrCreateIngestToken: vi.fn(async () => 'a'.repeat(32)),
	regenerateIngestToken: vi.fn(async () => 'b'.repeat(32)),
	ingestAddress: (token: string) =>
		process.env.RECEIPT_INGEST_DOMAIN
			? `receipts.${token}@${process.env.RECEIPT_INGEST_DOMAIN}`
			: null,
	findUserIdByIngestToken: vi.fn(),
	generateIngestToken: vi.fn(),
	isValidIngestToken: vi.fn(),
	INGEST_TOKEN_LENGTH: 32
}));

describe('/api/receipt-ingest-address', () => {
	it('401s without a user', async () => {
		const restore = env({ RECEIPT_INGEST_DOMAIN: 'ingest.test' });
		try {
			expect((await GET(event(null))).status).toBe(401);
			expect((await POST(event(null))).status).toBe(401);
		} finally {
			restore();
		}
	});

	it('returns the address when the ingest domain is configured', async () => {
		const restore = env({ RECEIPT_INGEST_DOMAIN: 'ingest.test' });
		try {
			const res = await GET(event('u1'));
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.address).toBe('receipts.' + 'a'.repeat(32) + '@ingest.test');
		} finally {
			restore();
		}
	});

	it('hides the address when the ingest domain is unset', async () => {
		const restore = env({ RECEIPT_INGEST_DOMAIN: undefined });
		try {
			const res = await GET(event('u1'));
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.address).toBeNull();
		} finally {
			restore();
		}
	});

	it('POST regenerates the token and returns the new address', async () => {
		const restore = env({ RECEIPT_INGEST_DOMAIN: 'ingest.test' });
		try {
			const res = await POST(event('u1'));
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.address).toBe('receipts.' + 'b'.repeat(32) + '@ingest.test');
		} finally {
			restore();
		}
	});

	it('POST 503s when the ingest domain is unset', async () => {
		const restore = env({ RECEIPT_INGEST_DOMAIN: undefined });
		try {
			const res = await POST(event('u1'));
			expect(res.status).toBe(503);
		} finally {
			restore();
		}
	});
});
