import { describe, it, expect, vi, afterEach } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { actions } from './+page.server';
import type { RequestEvent } from './$types';

/**
 * Issue 276 — a signed-in browser POSTed to `/` and got SvelteKit's 405
 * "No form actions exist for this page" error page (auto-filed). No in-app
 * form targets `/` (#023/#059 sweeps, re-checked for #276), so the landing
 * page answers a stray POST with Post/Redirect/Get back to itself instead of
 * an error page, and logs the request's origin hints so the sender can still
 * be found in the Vercel logs.
 */

function postToRoot(headers: Record<string, string> = {}): RequestEvent {
	// SAFETY: the default action reads only `request` headers; the rest of the
	// RequestEvent surface is never touched.
	return {
		request: new Request('https://www.familyplanz.com/', { method: 'POST', headers }),
		url: new URL('https://www.familyplanz.com/')
	} as RequestEvent;
}

describe('POST / (#276)', () => {
	afterEach(() => vi.restoreAllMocks());

	it('redirects a stray POST back to the landing page with 303 (PRG), not a 405', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		let thrown: unknown;
		try {
			await actions.default(postToRoot());
		} catch (e) {
			thrown = e;
		}
		expect(isRedirect(thrown)).toBe(true);
		if (!isRedirect(thrown)) return;
		expect(thrown.status).toBe(303);
		expect(thrown.location).toBe('/');
	});

	it('logs the sender hints (referer, user-agent, content-type) for diagnosis', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await actions
			.default(
				postToRoot({
					referer: 'https://www.familyplanz.com/calendar',
					'user-agent': 'TestAgent/1.0',
					'content-type': 'application/x-www-form-urlencoded'
				})
			)
			.catch(() => {});
		expect(warn).toHaveBeenCalledTimes(1);
		const logged = JSON.stringify(warn.mock.calls[0]);
		expect(logged).toContain('https://www.familyplanz.com/calendar');
		expect(logged).toContain('TestAgent/1.0');
		expect(logged).toContain('application/x-www-form-urlencoded');
	});
});
