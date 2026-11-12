// Signing a page in and landing on it: run the seed, hand the browser the
// app's own session cookie, then navigate once and prove the page is the one
// the catalog promised.
//
// Doc: e2e/pages/README.md
import { expect, type Page } from '@playwright/test';
import { isAnonymousAccount } from '$lib/utils/anonymous';
import { resolvePath, type PageEntry } from './catalog';
import { loginWithSession } from '../testUtils';
import { runSeed, type SeedName, type SeedResult } from './seeds';

/**
 * Run `seed` against the pages database and attach what the page needs:
 * the session cookie (once the seed created a user) and any cookie the page
 * itself reads (the guest-merge stash).
 *
 * Returns the seed result so the caller can fill `[param]` placeholders from it.
 */
export async function openAs(page: Page, seed: SeedName): Promise<SeedResult> {
	const result = await runSeed(seed);

	if (result.email) {
		// The app's own login path (a real `authSession` row + the signed
		// cookie), shared with the rest of e2e; see e2e/testUtils.ts.
		await loginWithSession(page, result.email);
	}

	if (result.cookies?.length) {
		await page.context().addCookies(
			result.cookies.map((cookie) => ({
				name: cookie.name,
				value: cookie.value,
				domain: 'localhost',
				path: '/',
				httpOnly: true,
				secure: false,
				sameSite: 'Lax' as const
			}))
		);
	}

	return result;
}

/** The subset of GET /api/me this helper asserts against. */
type MePayload = { email: string | null; isAnonymous: boolean };

/**
 * Navigate to `entry` and prove the harness is looking at the right page as
 * the right person. The shared path for the visual check (here) and the perf
 * harness (K-11): both must time the same arrival.
 *
 * 1. the host's network state does not reach the page: the offline banner keys
 *    off `navigator.onLine`, and an offline machine would change the pixels;
 * 2. the entry's `ready` selector is visible (the page's data arrived);
 * 3. the landing path is the resolved route (or its `landsOn`);
 * 4. the signed-in user is the seed's. A broken cookie does NOT redirect a
 *    protected route to /login: hooks.server.ts creates an anonymous user
 *    instead (src/hooks.server.ts:84-93), so a redirect check alone would pass
 *    and every screenshot would be a guest's. Compare GET /api/me with the
 *    seed's own identity instead.
 */
export async function gotoReady(page: Page, entry: PageEntry, seed: SeedResult): Promise<void> {
	await page.addInitScript(() => {
		Object.defineProperty(Navigator.prototype, 'onLine', { get: () => true });
	});

	await page.goto(resolvePath(entry.path, seed.params));
	await page.locator(entry.ready).first().waitFor({ state: 'visible' });

	const landed = new URL(page.url());
	const expected = new URL(resolvePath(entry.landsOn ?? entry.path, seed.params), landed);
	expect(landed.pathname, `${entry.name} landed on ${landed.pathname}`).toBe(expected.pathname);

	const response = await page.request.get(new URL('/api/me', landed).toString());
	if (seed.email === undefined) {
		// A page a signed-out visitor sees: the seed created no user, so no
		// session may exist either.
		expect(response.status(), `${entry.name} should be signed out`).toBe(401);
		return;
	}

	expect(response.status(), `${entry.name} should be signed in`).toBe(200);
	const me: MePayload = await response.json();
	if (isAnonymousAccount({ email: seed.email })) {
		// /api/me masks a guest's placeholder address to null.
		expect(me.isAnonymous, `${entry.name} should be the seeded guest`).toBe(true);
		expect(me.email, `${entry.name} should not show a guest address`).toBeNull();
	} else {
		expect(me.email, `${entry.name} should be signed in as the seeded user`).toBe(seed.email);
		expect(me.isAnonymous, `${entry.name} should not be a guest`).toBe(false);
	}
}
