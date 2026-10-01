import { describe, it, expect, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

/**
 * Issue 124 — the stranger who followed a link they cannot use.
 *
 * `/family/join/[code]` used to answer an unverifiable code with
 * `redirect('/family?error=invalid_invite')`. Nothing reads that query
 * parameter, and for a signed-out visitor `/family` is itself a redirect to
 * sign-in — so somebody who clicked a stale invite link in an email was
 * silently dumped two pages away with no idea what had happened.
 *
 * `verifyInviteCode` returns null for three different reasons (unknown,
 * expired, used up) and cannot tell them apart, so the page says all three and
 * does not pretend to know which it was. That is a decision, not a bug: see the
 * ticket.
 */

/** What `verifyInviteCode` answers with: a family, or nothing at all. */
interface Verification {
	family: { id: string; name: string; color: string };
}

const state = vi.hoisted((): { verified: Verification | null } => ({ verified: null }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- the one seam this loader calls; verifyInviteCode has its own coverage in families.test.ts.
vi.mock('$lib/server/db/actions/families', () => ({
	verifyInviteCode: async () => state.verified
}));

import { load } from './+page.server';

/** SAFETY: the loader reads params.code and locals.user, and nothing else. */
const runLoad = load as unknown as (event: {
	params: { code: string };
	locals: { user: { id: string } | null };
}) => Promise<{
	invalid: boolean;
	family: { id: string; name: string; color: string } | null;
	code: string;
	isLoggedIn: boolean;
}>;

const VALID_FAMILY = { id: 'fam-1', name: 'The Hoppers', color: '#c45e38' };

describe('join page — an unusable link explains itself', () => {
	it('says the link is unusable instead of redirecting to a page that ignores the query', async () => {
		state.verified = null;

		let thrown: unknown;
		let data: Awaited<ReturnType<typeof runLoad>> | null = null;
		try {
			data = await runLoad({ params: { code: 'stale-code' }, locals: { user: null } });
		} catch (e) {
			thrown = e;
		}

		expect(isRedirect(thrown)).toBe(false);
		expect(data?.invalid).toBe(true);
		expect(data?.family).toBeNull();
		// The code is kept so the page can say which link failed, not so it can
		// be used for anything.
		expect(data?.code).toBe('stale-code');
	});

	it('still renders the join step for a code that verifies', async () => {
		state.verified = { family: VALID_FAMILY };

		const data = await runLoad({ params: { code: 'good-code' }, locals: { user: { id: 'u1' } } });

		expect(data.invalid).toBe(false);
		expect(data.family).toEqual(VALID_FAMILY);
		expect(data.isLoggedIn).toBe(true);
	});
});