/**
 * Golden contract for the module's only `/api` route, `POST /api/contact`
 * (legacy: an actions file with no page component, so it is hit as a form).
 * Status, body and the exact messages are fixed for every installed caller;
 * these tests stay unchanged through the port.
 * Doc: ./README.md#invariants
 *
 * Legacy detail: the action builds its Resend client at import and sends over
 * the network. A dummy key is set before the dynamic import (the client throws
 * without one) and `fetch` is stubbed to answer as Resend does, so nothing here
 * leaves the machine. Only the HTTP contract is asserted.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';

type ContactAction = (event: never) => Response | Promise<Response>;

/** Imported in `beforeAll`, once the mailer stub and the dummy key exist. */
let postContact: ContactAction = () => {
	throw new Error('POST /api/contact was not imported — beforeAll did not run');
};

/**
 * One submit, form-encoded, with its own client IP so rate-limit buckets never
 * mix. Pass one `ctx` per test when the budget matters: after the port the
 * limiter lives on `ctx`, so a fresh ctx per request would start every bucket
 * empty (legacy ignores `ctx` and shares one module-scope map).
 */
function send(ip: string, fields: Record<string, string>, ctx = testCtx({ db: testDb() })) {
	return invoke(postContact, {
		ctx,
		path: '/api/contact',
		headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-real-ip': ip },
		rawBody: new URLSearchParams(fields).toString()
	});
}

/** SvelteKit's generated `Actions` type erases that the action answers a Response. */
function asContactAction(value: unknown): ContactAction {
	if (typeof value !== 'function') throw new Error('POST /api/contact has no default action');
	// SAFETY: `invoke` builds a full RequestEvent double and only reads the
	// returned status and body; every branch of this action returns `json()`.
	return value as ContactAction;
}

beforeAll(async () => {
	process.env.RESEND_API_KEY ??= 're_test_stub';
	// Resend reads only `ok`, `text()` and `json()` off the response.
	vi.stubGlobal(
		'fetch',
		async () =>
			new Response(JSON.stringify({ id: 'email_1' }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
	);
	// Dynamic on purpose: a static import would load with the module graph,
	// before this file's dummy RESEND_API_KEY assignment can run.
	const route = await import('../../../routes/api/contact/+page.server');
	postContact = asContactAction(route.actions.default);
});

afterAll(() => {
	vi.unstubAllGlobals();
});

type MissingFieldCase = {
	readonly missing: string;
	readonly ip: string;
	readonly fields: Record<string, string>;
};

/** A row per required field (plus all three absent), each on its own client IP. */
const missingFieldCases: MissingFieldCase[] = [
	{ missing: 'name', ip: '203.0.113.4', fields: { email: 'alex@example.com', message: 'Hi' } },
	{ missing: 'email', ip: '203.0.113.5', fields: { name: 'Alex', message: 'Hi' } },
	{ missing: 'message', ip: '203.0.113.6', fields: { name: 'Alex', email: 'alex@example.com' } },
	{ missing: 'all three', ip: '203.0.113.7', fields: {} }
];

describe('POST /api/contact', () => {
	beforeEach(truncateAll);

	it('answers {success:true} to a complete form from a signed-out visitor', async () => {
		const res = await send('203.0.113.1', {
			name: 'Alex',
			email: 'alex@example.com',
			message: 'The grocery list is great.'
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
	});

	it('rejects a filled honeypot with 400 Invalid submission', async () => {
		const res = await send('203.0.113.2', {
			name: 'Alex',
			email: 'alex@example.com',
			message: 'Hi',
			website: 'http://spam.example'
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Invalid submission' });
	});

	it('treats an empty honeypot as absent', async () => {
		const res = await send('203.0.113.3', {
			name: 'Alex',
			email: 'alex@example.com',
			message: 'Hi',
			website: ''
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
	});

	it.each(missingFieldCases)(
		'rejects a form with $missing missing: 400 All fields are required',
		async ({ ip, fields }) => {
			const res = await send(ip, fields);
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'All fields are required' });
		}
	);

	it.each([
		{ email: 'not-an-email', ip: '203.0.113.8' },
		{ email: 'alex@example', ip: '203.0.113.9' },
		{ email: 'alex example.com', ip: '203.0.113.10' },
		{ email: ' alex@example.com', ip: '203.0.113.11' }
	])('rejects the address $email with 400 Please enter a valid email address', async (row) => {
		const res = await send(row.ip, { name: 'Alex', email: row.email, message: 'Hi' });
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Please enter a valid email address' });
	});

	it('does not trim: a whitespace-only message is still sent', async () => {
		// /contact trims `message` before its required check; /api/contact does
		// not, and that difference is on the wire.
		const res = await send('203.0.113.12', {
			name: 'Alex',
			email: 'alex@example.com',
			message: '   '
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
	});

	it('limits each client IP to 3 submits, then 429 Too many attempts', async () => {
		const ctx = testCtx({ db: testDb() });
		const ip = '203.0.113.13';
		const honeypot = {
			name: 'Alex',
			email: 'alex@example.com',
			message: 'Hi',
			website: 'bot'
		};
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const allowed = await send(ip, honeypot, ctx);
			expect(allowed.status).toBe(400);
			expect(allowed.body).toEqual({ error: 'Invalid submission' });
		}
		// A complete, valid form is still refused: the gate runs before the form
		// is read and before any email is sent.
		const blocked = await send(
			ip,
			{ name: 'Alex', email: 'alex@example.com', message: 'Hi' },
			ctx
		);
		expect(blocked.status).toBe(429);
		expect(blocked.body).toEqual({ error: 'Too many attempts. Try again shortly.' });
	});

	it('keeps a separate budget per client IP', async () => {
		const ctx = testCtx({ db: testDb() });
		const honeypot = {
			name: 'Alex',
			email: 'alex@example.com',
			message: 'Hi',
			website: 'bot'
		};
		for (let attempt = 0; attempt < 3; attempt += 1) await send('203.0.113.14', honeypot, ctx);

		const otherClient = await send('203.0.113.15', honeypot, ctx);
		expect(otherClient.status).toBe(400);
		expect(otherClient.body).toEqual({ error: 'Invalid submission' });
	});
});
