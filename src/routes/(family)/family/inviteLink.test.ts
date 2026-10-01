import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isActionFailure } from '@sveltejs/kit';

/**
 * Issue 091 — "Invite by link", on the family page.
 *
 * Everything the invite flow needs already worked: mint a code, copy the link,
 * revoke it, join. What nobody could do was *find* it — the only road was
 * "Add member" then "Manage invitations", two clicks onto a page about
 * managing codes rather than sending one.
 *
 * So this page mints its own code and hands back the link, right where the
 * person already is. The gate is the same one `/api/family/invite` uses:
 * minting is creator/admin, so a plain member gets a refusal that says so
 * rather than a form that quietly does nothing.
 */

/** The role lookup's answer per family, and every code that was minted. */
interface StubState {
	roles: Map<string, string | null>;
	minted: MintCall[];
}

interface MintCall {
	familyId: string;
	options: Record<string, string>;
}

const state = vi.hoisted((): StubState => ({ roles: new Map(), minted: [] }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- the two seams the action calls; the actions' own contracts are tested in families.test.ts.
vi.mock('$lib/server/db/actions/families', () => ({
	getFamilyMemberRole: async (_userId: string, familyId: string) =>
		state.roles.get(familyId) ?? null,
	generateInviteCode: async (familyId: string, options: Record<string, string>) => {
		state.minted.push({ familyId, options });
		return { code: `code-for-${familyId}`, familyId };
	}
}));

import { actions } from './+page.server';

/** What the action answers with: a shareable link, or a refusal that says who may mint. */
type MintOutcome =
	| { familyId: string; inviteCode: string; inviteUrl: string }
	| { status: number; data: { error: string } };

/** SAFETY: the action reads locals.user and the posted form body, nothing else. */
const mintInvite = actions.mintInvite as unknown as (event: {
	request: Request;
	locals: { user: { id: string } | null };
}) => Promise<MintOutcome>;

/** Mint an invite for a family as the given user. */
function mint(familyId: string, userId: string | null = 'creator-1'): Promise<MintOutcome> {
	return mintInvite({
		request: new Request('http://localhost/family?/mintInvite', {
			method: 'POST',
			body: new URLSearchParams({ familyId })
		}),
		locals: { user: userId ? { id: userId } : null }
	});
}

beforeEach(() => {
	state.roles = new Map();
	state.minted = [];
});

describe('invite by link — a creator gets a shareable link without leaving the page (issue 091)', () => {
	it('mints a code for the family and returns the join link', async () => {
		state.roles.set('fam-1', 'creator');

		const outcome = await mint('fam-1');

		expect(outcome).toMatchObject({ familyId: 'fam-1', inviteUrl: '/family/join/code-for-fam-1' });
		expect(state.minted).toHaveLength(1);
		expect(state.minted[0]).toMatchObject({ familyId: 'fam-1' });
	});

	it('credits the code to the person who minted it', async () => {
		state.roles.set('fam-1', 'admin');

		await mint('fam-1', 'admin-7');

		expect(state.minted[0].options).toMatchObject({ createdBy: 'admin-7' });
	});

	it('sends a plain member a refusal instead of a link they cannot use', async () => {
		state.roles.set('fam-1', 'member');

		const outcome = await mint('fam-1');

		expect(isActionFailure(outcome)).toBe(true);
		expect(state.minted).toEqual([]);
	});

	it('sends somebody who is not in the family at all to sign in', async () => {
		state.roles.set('fam-1', null);

		const outcome = await mint('fam-1', 'stranger');

		expect(isActionFailure(outcome)).toBe(true);
		expect(state.minted).toEqual([]);
	});
});