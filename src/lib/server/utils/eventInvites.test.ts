import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * resolveEventInvites hits the family roster via the families actions, so the
 * actions module is scripted: the test controls the caller's family id and
 * roster to exercise the recognized/unknown member-id contract.
 */
// SAFETY: narrowed mutable test state — the literal initializers below are the
// only writers, so the assertions match the actual value types exactly.
const rosterState = vi.hoisted(() => ({
	familyId: null as string | null,
	members: [] as { userId: string }[]
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- roster scripted; action-internal behavior covered by families.test.ts.
vi.mock('$lib/server/db/actions/families', () => ({
	getUserFamilyId: vi.fn(async () => rosterState.familyId),
	getFamilyRoster: vi.fn(async () => rosterState.members)
}));

import { resolveEventInvites } from './eventInvites';

const SELF_ID = 'user-self';
const MEMBER_ID = 'user-member';
const STRANGER_ID = 'user-stranger';

describe('resolveEventInvites', () => {
	beforeEach(() => {
		rosterState.familyId = 'fam-1';
		rosterState.members = [{ userId: MEMBER_ID }];
	});

	it('drops unrecognized user ids entirely (never stored as guest names)', async () => {
		const out = await resolveEventInvites(SELF_ID, [
			{ value: STRANGER_ID, isUser: true, inviteType: 'optional' }
		]);
		expect(out).toEqual([]);
	});

	it('keeps the caller themself as a member invite with requested inviteType', async () => {
		const out = await resolveEventInvites(SELF_ID, [
			{ value: SELF_ID, isUser: true, inviteType: 'required' }
		]);
		expect(out).toEqual([{ userId: SELF_ID, inviteType: 'required' }]);
	});

	it('keeps roster member ids as member invites', async () => {
		const out = await resolveEventInvites(SELF_ID, [
			{ value: MEMBER_ID, isUser: true, inviteType: 'required' }
		]);
		expect(out).toEqual([{ userId: MEMBER_ID, inviteType: 'required' }]);
	});

	it('defaults unrecognized member-invite type to optional', async () => {
		const out = await resolveEventInvites(SELF_ID, [
			{ value: MEMBER_ID, isUser: true, inviteType: 'nonsense' }
		]);
		expect(out).toEqual([{ userId: MEMBER_ID, inviteType: 'optional' }]);
	});

	it('keeps plain guest-name strings', async () => {
		const out = await resolveEventInvites(SELF_ID, ['Jane Doe', '  ', '']);
		expect(out).toEqual([{ name: 'Jane Doe', inviteType: 'optional' }]);
	});

	it('treats non-user object entries as guest names', async () => {
		const out = await resolveEventInvites(SELF_ID, [{ value: 'Jane' }]);
		expect(out).toEqual([{ name: 'Jane', inviteType: 'optional' }]);
	});

	it('keeps members and guests together, dropping stranger ids in a mixed payload', async () => {
		const out = await resolveEventInvites(SELF_ID, [
			'Guest Person',
			{ value: STRANGER_ID, isUser: true, inviteType: 'required' },
			{ value: MEMBER_ID, isUser: true, inviteType: 'required' }
		]);
		expect(out).toEqual([
			{ name: 'Guest Person', inviteType: 'optional' },
			{ userId: MEMBER_ID, inviteType: 'required' }
		]);
	});

	it('returns [] for non-array payloads', async () => {
		expect(await resolveEventInvites(SELF_ID, null)).toEqual([]);
		expect(await resolveEventInvites(SELF_ID, 'Jane')).toEqual([]);
		expect(await resolveEventInvites(SELF_ID, [])).toEqual([]);
	});

	it('without a family, only the caller id is recognized; stranger ids drop', async () => {
		rosterState.familyId = null;
		const out = await resolveEventInvites(SELF_ID, [
			{ value: SELF_ID, isUser: true, inviteType: 'required' },
			{ value: STRANGER_ID, isUser: true }
		]);
		expect(out).toEqual([{ userId: SELF_ID, inviteType: 'required' }]);
	});
});
