/**
 * The `(marketing)` page routes: `/contact`'s action, the layout load, the
 * `/android` load and the stray `POST /`. These are page routes, not `/api`
 * goldens, so they are tested here through `invokeAction` / `invokeLoad`; the
 * expected copy and values are the legacy routes' and `published.json`'s, never
 * this module's output.
 *
 * Doc: ./README.md#invariants
 */
import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { ActionFail } from '$lib/kernel/http/pageHandlers.server';
import { isActionFailure, invokeAction, invokeLoad } from '$lib/kernel/testing/invokeHandlers.server';
import { testCtx, type TestCtx } from '$lib/kernel/testing/testCtx.server';
import {
	androidPageLoad,
	contactFormAction,
	marketingLayoutLoad,
	strayRootPostAction
} from './marketing.http.server';

const valid = { name: 'Alex', email: 'alex@example.com', message: 'Hi there' };

/** One `/contact` submit from its own client IP. */
function submit(ctx: TestCtx, form: Record<string, string>, ip = '203.0.113.20') {
	return invokeAction(contactFormAction, {
		ctx,
		path: '/contact',
		form,
		headers: { 'x-real-ip': ip }
	});
}

describe('POST /contact', () => {
	it('sends the message and answers { success: true }', async () => {
		const ctx = testCtx();
		const result = await submit(ctx, valid);

		expect(result).toEqual({ success: true });
		expect(ctx.mail.outbox).toHaveLength(1);
		expect(ctx.mail.outbox[0].to).toBe('hello@familyplanz.com');
		expect(ctx.mail.outbox[0].subject).toBe('New Contact Form Submission from Alex');
		expect(ctx.mail.outbox[0].html).toContain('Hi there');
	});

	it.each([
		{
			why: 'a filled honeypot',
			form: { ...valid, website: 'http://spam.example' },
			status: 400,
			error: 'Invalid submission'
		},
		{
			why: 'a blank message (trimmed for the required check only)',
			form: { ...valid, message: '   ' },
			status: 400,
			error: 'All fields are required'
		},
		{
			why: 'no fields at all',
			form: {},
			status: 400,
			error: 'All fields are required'
		},
		{
			why: 'an address with no shape',
			form: { ...valid, email: 'not-an-email' },
			status: 400,
			error: 'Please enter a valid email address'
		}
	])('rejects $why with $status and a non-empty error', async ({ form, status, error }) => {
		const ctx = testCtx();
		const result = await submit(ctx, form);

		expect(isActionFailure<ActionFail>(result)).toBe(true);
		if (!isActionFailure<ActionFail>(result)) return;
		expect(result.status).toBe(status);
		expect(result.data).toEqual({ success: false, error });
		expect(result.data.error.length).toBeGreaterThan(0);
		expect(ctx.mail.outbox).toEqual([]);
	});

	it('limits each client IP to five submits per ten minutes, refusals included', async () => {
		const ctx = testCtx();
		const honeypot = { ...valid, website: 'bot' };
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const refused = await submit(ctx, honeypot);
			expect(isActionFailure<ActionFail>(refused) && refused.status).toBe(400);
		}

		// Legacy gated before it read or checked the form, so the refused
		// submits spent the budget: the sixth is refused before the mail.
		const blocked = await submit(ctx, valid);
		expect(isActionFailure<ActionFail>(blocked)).toBe(true);
		if (!isActionFailure<ActionFail>(blocked)) return;
		expect(blocked.status).toBe(429);
		expect(blocked.data).toEqual({
			success: false,
			error: 'Too many attempts. Try again shortly.'
		});
		expect(ctx.mail.outbox).toEqual([]);
	});

	it('answers provider failure with 500 Something went wrong, without filing a report', async () => {
		const ctx: TestCtx = {
			...testCtx(),
			mail: {
				outbox: [],
				send: async () => {
					throw new Error('provider down');
				}
			}
		};
		const result = await submit(ctx, valid);

		expect(isActionFailure<ActionFail>(result)).toBe(true);
		if (!isActionFailure<ActionFail>(result)) return;
		expect(result.status).toBe(500);
		expect(result.data).toEqual({
			success: false,
			error: 'Something went wrong. Please try again.'
		});
		expect(ctx.faults.reports).toEqual([]);
		expect(ctx.log.entries).toEqual([]);
	});
});

describe('the (marketing) layout load', () => {
	it('returns the origin and pathname the request arrived on', async () => {
		const data = await invokeLoad(marketingLayoutLoad, {
			ctx: testCtx(),
			path: '/features'
		});

		expect(data.origin).toBe('http://localhost');
		expect(data.pathname).toBe('/features');
		expect(data.isLoggedIn).toBe(false);
		expect(data.user).toBeNull();
	});

	it('never hardcodes the domain: the origin is the one the request arrived on', async () => {
		const data = await invokeLoad(marketingLayoutLoad, {
			ctx: testCtx(),
			path: '/pricing'
		});

		expect(data.origin).toBe('http://localhost');
		expect(data.origin).not.toBe('https://www.familyplanz.com');
		expect(data.pathname).toBe('/pricing');
	});

	it('passes the signed-in person and isLoggedIn to the shell', async () => {
		const user = {
			id: 'u1',
			email: 'u1@example.test',
			roles: [],
			firstName: 'Alex',
			lastName: 'Doe'
		};
		const data = await invokeLoad(marketingLayoutLoad, {
			ctx: testCtx(),
			path: '/',
			user
		});

		expect(data.isLoggedIn).toBe(true);
		expect(data.user).toEqual(user);
	});
});

describe('GET /android', () => {
	it('serves the view model of the committed publish record', async () => {
		const { release } = await invokeLoad(androidPageLoad, { ctx: testCtx() });

		expect(release.repoUrl).toBe('https://www.familyplanz.com/fdroid/repo');
		expect(release.repo).toEqual({
			fingerprint: 'E59447D790A760573B59FA0769F7A073C91142F3FA61D3B775B2486824E571EF',
			fingerprintGrouped:
				'E5 94 47 D7 90 A7 60 57 3B 59 FA 07 69 F7 A0 73 C9 11 42 F3 FA 61 D3 B7 75 B2 48 68 24 E5 71 EF',
			addRepoLink:
				'fdroidrepos://www.familyplanz.com/fdroid/repo?fingerprint=E59447D790A760573B59FA0769F7A073C91142F3FA61D3B775B2486824E571EF',
			qrUrl: '/fdroid/qr.svg'
		});
		expect(release.apk).toEqual({
			url: '/fdroid/repo/com.familyplanz.app_4000.apk',
			versionName: '0.4.0',
			sizeMb: '3.4',
			sha256: 'a3d793dd6f0b2a7cb5f73ea81783212a8bb892b0674fca39947638637c74a0b3'
		});
	});
});

describe('POST / (#276)', () => {
	async function postRoot(headers: Record<string, string>) {
		try {
			await invokeAction(strayRootPostAction, { ctx: testCtx(), path: '/', form: {}, headers });
		} catch (error) {
			return error;
		}
		throw new Error('POST / did not redirect');
	}

	it('answers 303 back to / and logs the sender hints (#276)', async () => {
		const ctx = testCtx();
		let thrown: unknown;
		try {
			await invokeAction(strayRootPostAction, {
				ctx,
				path: '/',
				form: {},
				headers: {
					referer: 'https://www.familyplanz.com/calendar',
					'user-agent': 'TestAgent/1.0',
					'content-type': 'application/x-www-form-urlencoded'
				}
			});
		} catch (error) {
			thrown = error;
		}

		expect(isRedirect(thrown)).toBe(true);
		if (!isRedirect(thrown)) return;
		expect(thrown.status).toBe(303);
		expect(thrown.location).toBe('/');
		expect(ctx.log.entries).toEqual([
			{
				level: 'warn',
				event: 'stray_root_post',
				fields: {
					referer: 'https://www.familyplanz.com/calendar',
					userAgent: 'TestAgent/1.0',
					contentType: 'application/x-www-form-urlencoded'
				}
			}
		]);
	});

	it('still redirects when the sender sent no hints', async () => {
		const thrown = await postRoot({});

		expect(isRedirect(thrown)).toBe(true);
		if (!isRedirect(thrown)) return;
		expect(thrown.status).toBe(303);
		expect(thrown.location).toBe('/');
	});
});
