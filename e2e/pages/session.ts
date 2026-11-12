// Signing a page in: run the seed, then hand the browser the app's own session
// cookie. Reuses `getSessionCookie` from the legacy e2e helpers, so the harness
// signs in exactly the way the rest of e2e does.
//
// Doc: e2e/pages/README.md
import type { Page } from '@playwright/test';
import { getSessionCookie } from '../testUtils';
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
		const cookie = await getSessionCookie(result.email);
		await page.context().addCookies([
			{
				name: cookie.name,
				value: cookie.value,
				// The preview server is plain http on localhost: the session
				// cookie must not be Secure, or the browser drops it (testUtils'
				// loginWithSession copies the attribute; here it is fixed).
				domain: 'localhost',
				path: '/',
				httpOnly: true,
				secure: false,
				sameSite: 'Lax'
			}
		]);
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
