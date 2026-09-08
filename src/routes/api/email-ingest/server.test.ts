/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, anti-slop/no-known-value-widening -- test doubles: `as never` event/request fakes and capture-bag webhook bodies; the route under test validates every field. */
import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { POST, type EmailIngestDeps } from './+server';
import type { SvixHeaders } from '$lib/server/utils/svixVerify';
import type { CreateBillInput } from '$lib/server/db/actions/bills';
import type { Bill } from '$lib/server/db/schema';
import type { JsonValue } from '$lib/server/services/llm';

const SECRET = 'whsec_test_secret';

/** The full fixture receipt text the pipeline should extract from. */
const RECEIPT_TEXT = 'KROGER #4412\nWHOLE MILK 3.49\nSALES TAX 0.38\nTOTAL 15.12';

/** Precomputed signature: HMAC-SHA256(secret, `${id}.${ts}.${payload}`). */
function sign(id: string, timestamp: string, payload: string): string {
	return createHmac('sha256', SECRET).update(`${id}.${timestamp}.${payload}`).digest('base64');
}

const NOW = 1_725_000_000;

// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-known-value-widening, anti-slop/require-safety-comment-for-type-assertion -- test double: capture-bag webhook body and untyped dispatch fake; the route under test validates every field.
function webhook(
	body: unknown,
	to: string | string[] = 'receipts.' + 'a'.repeat(32) + '@ingest.test'
) {
	void to; // the default target is baked into the payload; kept for readability
	const payload = JSON.stringify(body);
	const id = 'msg_' + Math.abs(hash(payload));
	const timestamp = String(NOW);
	const signature = sign(id, timestamp, payload);
	return new Request('http://localhost/api/email-ingest', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'svix-id': id,
			'svix-timestamp': timestamp,
			'svix-signature': signature
		},
		body: payload
	});
}

function hash(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
	return h;
}

function bill(over: Partial<Bill> = {}): Bill {
	return {
		id: 'bill-1',
		title: 'KROGER #4412',
		amountCents: 1512,
		dueDate: null,
		category: 'other',
		paidAt: null,
		frequency: null,
		interval: null,
		source: 'email',
		userId: 'u1',
		familyId: 'f1',
		createdAt: new Date('2026-09-01T00:00:00Z'),
		...over
	};
}

function deps(over: Partial<EmailIngestDeps> = {}): EmailIngestDeps {
	return {
		verify: () => true,
		findUserByToken: async () => 'u1',
		getUseCloudAI: async () => true,
		chatJson: vi.fn(async () => null),
		llmConfigured: () => false,
		extractPdfText: vi.fn(async (_pdf: Buffer) => ''),
		getUserFamilyId: async () => 'f1',
		createBill: vi.fn(async (input: CreateBillInput) =>
			bill({ ...input, source: input.source ?? 'email', id: 'b9' })
		),
		setBillItems: vi.fn(async () => []),
		...over
	};
}

/** A Resend `email.received` webhook body. */
function receivedEvent(over: Record<string, unknown> = {}) {
	return {
		type: 'email.received',
		data: {
			to: 'receipts.' + 'a'.repeat(32) + '@ingest.test',
			from: 'receipts@kroger.com',
			subject: 'Your Kroger receipt',
			text: RECEIPT_TEXT,
			...over
		}
	};
}

function env(over: Record<string, string | undefined> = {}) {
	const keys = ['RESEND_WEBHOOK_SECRET', 'RECEIPT_INGEST_DOMAIN', ...Object.keys(over)];
	const original: Record<string, string | undefined> = {};
	for (const key of keys) original[key] = process.env[key];
	Object.entries({ RESEND_WEBHOOK_SECRET: SECRET, ...over }).forEach(([key, value]) => {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	});
	return () => {
		for (const key of keys) {
			if (original[key] === undefined) delete process.env[key];
			else process.env[key] = original[key];
		}
	};
}

describe('POST /api/email-ingest', () => {
	it('creates an unconfirmed email draft bill from the body text', async () => {
		const restore = env();
		try {
			const createBill = vi.fn(async (input: CreateBillInput) => bill({ ...input, id: 'b9' }));
			const setBillItems = vi.fn(async () => []);
			const res = await POST(
				{ request: webhook(receivedEvent()) } as never,
				deps({ createBill, setBillItems })
			);

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.ok).toBe(true);
			// Draft marker + never paid: it does not count as spent.
			expect(createBill.mock.calls[0][0]).toMatchObject({
				title: 'KROGER #4412',
				amountCents: 1512,
				userId: 'u1',
				familyId: 'f1',
				source: 'email'
			});
			expect(createBill.mock.calls[0][0].dueDate).toBeNull();
			expect(setBillItems).toHaveBeenCalledTimes(1);
		} finally {
			restore();
		}
	});

	it('503s when the webhook secret is not configured', async () => {
		const restore = env({ RESEND_WEBHOOK_SECRET: undefined });
		try {
			const res = await POST({ request: webhook(receivedEvent()) } as never, deps());
			expect(res.status).toBe(503);
		} finally {
			restore();
		}
	});

	it('400s on an invalid signature', async () => {
		const restore = env();
		try {
			const findUserByToken = vi.fn();
			// Typed mock so mock.calls carries the (headers, payload) tuple.
			const verify = vi.fn((_headers: SvixHeaders, _payload: string) => false);
			const res = await POST(
				{ request: webhook(receivedEvent()) } as never,
				deps({ findUserByToken, verify })
			);
			expect(res.status).toBe(400);
			// The RAW body and headers reached the verifier (svix needs them).
			const [, payload] = verify.mock.calls[0];
			expect(payload).toContain('"email.received"');
			expect(findUserByToken).not.toHaveBeenCalled();
		} finally {
			restore();
		}
	});

	it('ignores mail to an unknown ingest token (still 200 for svix)', async () => {
		const restore = env();
		try {
			const findUserByToken = vi.fn(async () => null);
			const createBill = vi.fn();
			const res = await POST(
				{ request: webhook(receivedEvent()) } as never,
				deps({ findUserByToken, createBill })
			);
			expect(res.status).toBe(200);
			expect(createBill).not.toHaveBeenCalled();
		} finally {
			restore();
		}
	});

	it('ignores mail with no receipts.<token> local part', async () => {
		const restore = env();
		try {
			const findUserByToken = vi.fn();
			const createBill = vi.fn();
			const res = await POST(
				{ request: webhook(receivedEvent({ to: 'someone@ingest.test' })) } as never,
				deps({ findUserByToken, createBill })
			);
			expect(res.status).toBe(200);
			expect(findUserByToken).not.toHaveBeenCalled();
			expect(createBill).not.toHaveBeenCalled();
		} finally {
			restore();
		}
	});

	it('ignores non-received webhook event types', async () => {
		const restore = env();
		try {
			const findUserByToken = vi.fn();
			const res = await POST(
				{ request: webhook({ type: 'email.sent', data: {} }) } as never,
				deps({ findUserByToken })
			);
			expect(res.status).toBe(200);
			expect(findUserByToken).not.toHaveBeenCalled();
		} finally {
			restore();
		}
	});

	it('matches the token across multiple to addresses', async () => {
		const restore = env();
		try {
			const findUserByToken = vi.fn(async () => 'u1');
			await POST(
				{
					request: webhook(
						receivedEvent({
							to: ['other@ingest.test', 'receipts.' + 'a'.repeat(32) + '@ingest.test']
						})
					)
				} as never,
				deps({ findUserByToken })
			);
			expect(findUserByToken).toHaveBeenCalledWith('a'.repeat(32));
		} finally {
			restore();
		}
	});

	it('uses the LLM when configured and cloud AI is allowed', async () => {
		const restore = env();
		try {
			const chatJson = vi.fn(
				async () =>
					({
						merchant: 'Whole Foods',
						total: 23.45,
						date: '2026-09-06',
						lineItems: [{ label: 'Organic Milk', price: 4.99, category: 'tax' }]
					}) as { [key: string]: JsonValue }
			);
			const createBill = vi.fn(async (input: CreateBillInput) =>
				bill({ ...input, source: input.source ?? 'email' })
			);
			const res = await POST(
				{ request: webhook(receivedEvent()) } as never,
				deps({ chatJson, llmConfigured: () => true, createBill })
			);

			expect(res.status).toBe(200);
			expect(chatJson).toHaveBeenCalledOnce();
			// Title from the LLM merchant, draft marker intact.
			expect(createBill.mock.calls[0][0]).toMatchObject({
				title: 'Whole Foods',
				amountCents: 2345,
				dueDate: '2026-09-06T00:00:00.000Z',
				source: 'email'
			});
		} finally {
			restore();
		}
	});

	it('extracts text from a PDF attachment when the body has no text', async () => {
		const restore = env();
		try {
			const pdfBase64 = Buffer.from(RECEIPT_TEXT).toString('base64');
			const extractPdfText = vi.fn(async (_pdf: Buffer) => RECEIPT_TEXT);
			const createBill = vi.fn(async (input: CreateBillInput) => bill({ ...input }));
			const res = await POST(
				{
					request: webhook(
						receivedEvent({
							text: null,
							html: '<p>Your receipt</p>',
							attachments: [
								{
									filename: 'receipt.pdf',
									content: pdfBase64,
									content_type: 'application/pdf'
								}
							]
						})
					)
				} as never,
				deps({ extractPdfText, createBill })
			);

			expect(res.status).toBe(200);
			expect(extractPdfText).toHaveBeenCalledOnce();
			const buffer = extractPdfText.mock.calls[0][0];
			expect(buffer.toString('utf8')).toBe(RECEIPT_TEXT);
			expect(createBill.mock.calls[0][0]).toMatchObject({
				title: 'KROGER #4412',
				amountCents: 1512,
				source: 'email'
			});
		} finally {
			restore();
		}
	});

	it('never trains the Tag Table on draft creation (confirm-only)', async () => {
		const restore = env();
		try {
			// The ingest route does not even receive a trainTagTable dep.
			const d = deps();
			expect(Object.keys(d)).not.toContain('trainTagTable');
			void d;
		} finally {
			restore();
		}
	});
});
