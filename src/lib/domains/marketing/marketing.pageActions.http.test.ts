/**
 * The `(marketing)` page routes: the layout load, the `/android` load and the
 * stray `POST /`. These are page routes, not `/api` goldens, so they are tested
 * here through `invokeAction` / `invokeLoad`; the expected copy and values are
 * the legacy routes' and `published.json`'s, never this module's output.
 *
 * `/contact`'s own form action is gone (Q-068 answer B): the page posts to the
 * `/api/contact` action, whose wire is the golden's.
 *
 * Doc: ./README.md#invariants
 */
import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { invokeAction, invokeLoad } from '$lib/kernel/testing/invokeHandlers.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { androidPageLoad, marketingLayoutLoad, strayRootPostAction } from './marketing.http.server';
import type { UserRow } from '$lib/kernel/db/tables.server';

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

	it('prints the footer year from the clock, not the ambient one', async () => {
		const ctx = testCtx({ now: '2026-11-21T09:00:00Z' });
		const data = await invokeLoad(marketingLayoutLoad, { ctx, path: '/' });

		expect(data.year).toBe(2026);
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
		// The whitelist fills what the session row lacked with null (#324).
		expect(data.user).toStrictEqual({ ...user, emailVerified: null, lastActiveAt: null });
	});

	it('never serialises a credential or private column (#324): page data gets the public whitelist only', async () => {
		// A whole `users` row with every sensitive column populated, as
		// `locals.user` holds it server-side.
		const row: UserRow = {
			id: 'u-sarah',
			firstName: 'Sarah',
			lastName: 'Rivera',
			email: 'sarah@example.com',
			passwordHash: 'fake-bcrypt-hash-for-test',
			emailVerified: true,
			picture: null,
			roles: ['admin'],
			createdAt: new Date('2026-01-02T03:04:05Z'),
			lastActiveAt: new Date('2026-02-03T04:05:06Z'),
			updatedAt: new Date('2026-02-03T04:05:06Z'),
			phonenumber: '+15555550123',
			phonenumberVerified: true,
			lastLogin: new Date('2026-02-03T04:05:06Z'),
			receiptIngestToken: 'fake-receipt-token-for-test'
		};
		const data = await invokeLoad(marketingLayoutLoad, { ctx: testCtx(), path: '/', user: row });

		expect(data.isLoggedIn).toBe(true);
		expect(data.user).toStrictEqual({
			id: 'u-sarah',
			firstName: 'Sarah',
			lastName: 'Rivera',
			email: 'sarah@example.com',
			emailVerified: true,
			roles: ['admin'],
			lastActiveAt: new Date('2026-02-03T04:05:06Z')
		});
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
