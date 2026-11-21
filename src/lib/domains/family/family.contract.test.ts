/**
 * The wire contract: every `/api` body, query and response schema. The 400
 * copy and the absent-vs-null rules are the legacy wire, so the golden
 * handlers must parse with exactly these schemas at S6.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { firstIssueMessage, type JsonValue, z } from '$lib/kernel/validation/validators';
import { DEFAULT_INVITE_DAYS, DEFAULT_INVITE_MAX_USES } from './family.invites.rules';
import { INVITE_INVALID_EMAIL_MESSAGE, INVITE_NAMES_MESSAGE } from './family.members.rules';
import {
	AddChildBody,
	AddDirectBody,
	ChildAddedResponse,
	clampInviteDays,
	clampInviteUses,
	CreateFamilyBody,
	CreateFamilyFormBody,
	CreateFamilyResponse,
	FamilyDetailResponse,
	FamilyErrorResponse,
	FamilyOverviewResponse,
	FamilySearchQuery,
	FamilySearchResponse,
	InvitableUserResponse,
	InviteCodeBody,
	InviteCodesResponse,
	InviteEmailErrorResponse,
	InviteLinkResponse,
	InvitePreviewQuery,
	InvitePreviewResponse,
	InviteSentResponse,
	InviteTargetBody,
	MEMBER_IDS_NOT_ARRAY_MESSAGE,
	MemberPatchBody,
	MemberSearchQuery,
	MemberSearchResponse,
	MemberUpdatedResponse,
	MintInviteBody,
	MintInviteResponse,
	RosterQuery,
	RosterResponse,
	shareInvitePlan,
	UpdateFamilyBody,
	UpdateFamilyResponse
} from './family.contract';

function messageOf(schema: z.ZodType, value: unknown): string | null {
	const result = schema.safeParse(value);
	return result.success ? null : firstIssueMessage(result.error);
}

describe('CreateFamilyBody: the legacy coercions and the one early refusal', () => {
	it('parses the documented body', () => {
		expect(CreateFamilyBody.parse({ name: 'Riveras', color: '#4d9c85', memberIds: ['u2'] })).toEqual({
			name: 'Riveras',
			color: '#4d9c85',
			memberIds: ['u2']
		});
	});

	it('reads an absent body field as an empty string, never a 400', () => {
		const body = CreateFamilyBody.parse({});
		expect([body.name, body.color, body.memberIds]).toEqual(['', '', undefined]);
	});

	it.each([
		['a number', 5],
		['a boolean', true],
		['null', null],
		['an object', { name: 'Riveras' }],
		['an array', []]
	])('reads a %s name or colour as empty, like the legacy route', (_what, value) => {
		const body = CreateFamilyBody.parse({ name: value, color: value });
		expect([body.name, body.color]).toEqual(['', '']);
	});

	it('keeps the name untrimmed: the create rule trims and measures it', () => {
		expect(CreateFamilyBody.parse({ name: ' Riveras ' }).name).toBe(' Riveras ');
	});

	it.each<[string, unknown]>([
		['a string', 'u2'],
		['null', null],
		['a number', 5],
		['an object', { id: 'u2' }]
	])('answers the one 400 copy for a %s memberIds, before the plan gate', (_what, memberIds) => {
		expect(messageOf(CreateFamilyBody, { name: 'Riveras', memberIds })).toBe(
			MEMBER_IDS_NOT_ARRAY_MESSAGE
		);
	});

	it('accepts an absent memberIds and a list that holds anything JSON', () => {
		expect(CreateFamilyBody.safeParse({ name: 'x' }).success).toBe(true);
		expect(CreateFamilyBody.safeParse({ name: 'x', memberIds: [1, null, true, ['y']] }).success).toBe(
			true
		);
	});

	it('keeps the legacy memberIds copy verbatim', () => {
		expect(MEMBER_IDS_NOT_ARRAY_MESSAGE).toBe('memberIds must be an array');
	});
});

describe('CreateFamilyFormBody: the page action', () => {
	it('reads one memberIds field per pick', () => {
		expect(
			CreateFamilyFormBody.parse({ name: 'Riveras', color: '#4d9c85', memberIds: ['a', 'b'] })
		).toEqual({ name: 'Riveras', color: '#4d9c85', memberIds: ['a', 'b'] });
	});

	it('reads a single memberIds field as a list and an absent one as empty', () => {
		expect(CreateFamilyFormBody.parse({ name: 'x', memberIds: 'a' }).memberIds).toEqual(['a']);
		expect(CreateFamilyFormBody.parse({ name: 'x' }).memberIds).toEqual([]);
	});
});

describe('UpdateFamilyBody: absent means unchanged, present-and-blank is refused', () => {
	it('trims a present name and leaves an absent field out', () => {
		expect(UpdateFamilyBody.parse({ name: ' Riveras ' })).toEqual({ name: 'Riveras' });
		expect(UpdateFamilyBody.parse({})).toEqual({});
	});

	it('accepts any six-digit hex colour, either case (Q-025)', () => {
		for (const color of ['#000001', '#C45E38', '#c45e38']) {
			expect(UpdateFamilyBody.parse({ color })).toEqual({ color });
		}
	});

	it.each<[string, unknown, string]>([
		['a blank name', { name: '   ' }, 'Invalid name'],
		['a non-string name', { name: 5 }, 'Invalid name'],
		['a null name', { name: null }, 'Invalid name'],
		['a colour word', { color: 'green' }, 'Invalid color'],
		['a null colour', { color: null }, 'Invalid color'],
		['a short hex', { color: '#c45e3' }, 'Invalid color'],
		['a non-string colour', { color: 5 }, 'Invalid color']
	])('%s answers its own 400 copy', (_what, value, message) => {
		expect(messageOf(UpdateFamilyBody, value)).toBe(message);
	});
});

describe('MemberPatchBody: absent skips the branch, null runs it and refuses', () => {
	it('leaves an absent field absent', () => {
		expect(MemberPatchBody.parse({})).toEqual({});
	});

	it('turns null into the empty string the rule refuses', () => {
		expect(MemberPatchBody.parse({ role: null })).toEqual({ role: '' });
		expect(MemberPatchBody.parse({ memberType: null })).toEqual({ memberType: '' });
	});

	it('keeps strings, including an unknown role for the rule to name', () => {
		expect(MemberPatchBody.parse({ role: 'owner', memberType: 'child' })).toEqual({
			role: 'owner',
			memberType: 'child'
		});
	});
});

describe('the member-add bodies', () => {
	it('reads a non-string direct userId as no user id', () => {
		expect(AddDirectBody.parse({})).toEqual({});
		expect(AddDirectBody.parse({ userId: null })).toEqual({ userId: '' });
		expect(AddDirectBody.parse({ userId: 5 })).toEqual({ userId: '' });
		expect(AddDirectBody.parse({ userId: 'u2' })).toEqual({ userId: 'u2' });
	});

	it('keeps the child address and names raw for the rule to check', () => {
		expect(
			AddChildBody.parse({
				firstName: ' Mia ',
				lastName: ' Nakamura ',
				email: 'Mia@Kids.Example.Test',
				consentAcknowledged: true
			})
		).toEqual({
			firstName: ' Mia ',
			lastName: ' Nakamura ',
			email: 'Mia@Kids.Example.Test',
			consentAcknowledged: true
		});
	});

	it.each<[string, unknown, boolean]>([
		['a literal true', true, true],
		['false', false, false],
		['the string "true"', 'true', false],
		['a checkbox "on"', 'on', false],
		['absent', undefined, false],
		['null', null, false]
	])('only a %s consents → %s', (_what, value, expected) => {
		const body = value === undefined ? {} : { consentAcknowledged: value };
		expect(AddChildBody.parse(body).consentAcknowledged).toBe(expected);
	});

	it('reads a non-string invite target field as empty for the rule to refuse', () => {
		expect(InviteTargetBody.parse({ email: 5, firstName: null })).toEqual({
			email: '',
			firstName: '',
			lastName: ''
		});
	});
});

describe('invite bodies and queries', () => {
	it('reads the mint body, including counts the clamps will judge', () => {
		expect(MintInviteBody.parse({ familyId: 'fam-1', expiresInDays: '3', maxUses: 999 })).toEqual({
			familyId: 'fam-1',
			expiresInDays: '3',
			maxUses: 999
		});
		expect(MintInviteBody.parse({})).toEqual({ familyId: '' });
	});

	it('reads a non-string familyId as empty so mint answers its 403, not a 400', () => {
		expect(MintInviteBody.parse({ familyId: null })).toEqual({ familyId: '' });
	});

	it('reads the preview code as empty when absent or blank', () => {
		expect(InvitePreviewQuery.parse({})).toEqual({ code: '' });
		expect(InvitePreviewQuery.parse({ code: '' })).toEqual({ code: '' });
		expect(InvitePreviewQuery.parse({ code: 'LIVE000001' })).toEqual({ code: 'LIVE000001' });
	});

	it('reads revoke/join codes the same way', () => {
		expect(InviteCodeBody.parse({})).toEqual({ code: '' });
		expect(InviteCodeBody.parse({ code: null })).toEqual({ code: '' });
		expect(InviteCodeBody.parse({ code: 'LIVE000001' })).toEqual({ code: 'LIVE000001' });
	});
});

describe('search and roster queries', () => {
	it('reads an absent picker term as empty and repeated excludes as a list', () => {
		expect(MemberSearchQuery.parse({})).toEqual({ q: '', exclude: [] });
		expect(MemberSearchQuery.parse({ q: 'an', exclude: ['a', 'b'] })).toEqual({
			q: 'an',
			exclude: ['a', 'b']
		});
		expect(MemberSearchQuery.parse({ q: 'an', exclude: 'a' }).exclude).toEqual(['a']);
		// Legacy `.filter(Boolean)`: blank ids never reach the query.
		expect(MemberSearchQuery.parse({ q: 'an', exclude: ['a', '', 'b'] }).exclude).toEqual(['a', 'b']);
		expect(MemberSearchQuery.parse({ q: 'an', exclude: '' }).exclude).toEqual([]);
	});

	it('reads an absent or blank roster familyId as null, but keeps whitespace', () => {
		expect(RosterQuery.parse({})).toEqual({ familyId: null });
		expect(RosterQuery.parse({ familyId: '' })).toEqual({ familyId: null });
		expect(RosterQuery.parse({ familyId: ' fam-1 ' })).toEqual({ familyId: ' fam-1 ' });
	});

	it('reads a missing search half as empty/null, which the route answers with an empty list', () => {
		expect(FamilySearchQuery.parse({})).toEqual({ q: '', familyId: null });
		expect(FamilySearchQuery.parse({ q: 'ann' })).toEqual({ q: 'ann', familyId: null });
	});
});

describe('response schemas', () => {
	const familyWire = {
		id: 'fam-1',
		name: 'Riveras',
		color: '#c45e38',
		createdAt: '2026-01-01T00:00:00.000Z'
	};

	const rosterWire = {
		userId: 'u1',
		firstName: 'Ann',
		lastName: 'Rivera',
		email: 'ann@example.test',
		role: 'creator',
		memberType: 'parent'
	};

	it('describes the list payload with ISO timestamps, never Dates', () => {
		const body = {
			families: [
				{
					...familyWire,
					memberCount: 3,
					openTasks: 1,
					members: [{ firstName: 'Ann', userId: 'u1' }],
					createdLabel: '1/1/2026',
					canInvite: true,
					role: 'creator'
				}
			],
			// The list's roster rows carry no email (golden: 'orders families oldest first…').
			roster: [
				{
					familyId: 'fam-1',
					userId: 'u1',
					firstName: 'Ann',
					lastName: 'Rivera',
					role: 'creator',
					memberType: 'parent'
				}
			],
			activeInvites: [
				{
					familyId: 'fam-1',
					code: 'LIVE000001',
					useCount: 0,
					maxUses: 10,
					expiresAt: '2099-01-01T00:00:00.000Z'
				}
			],
			plan: { used: 1, limit: 1 }
		};
		expect(FamilyOverviewResponse.parse(body)).toEqual(body);
		// A roster row with an email is not the list's shape: the key is stripped, not carried.
		expect(
			FamilyOverviewResponse.parse({
				...body,
				roster: [{ ...rosterWire, familyId: 'fam-1' }]
			}).roster
		).toEqual(body.roster);
		expect(
			FamilyOverviewResponse.safeParse({
				...body,
				families: [{ ...body.families[0], createdAt: new Date() }]
			}).success
		).toBe(false);
	});

	it('describes the detail payload', () => {
		const body = {
			family: familyWire,
			members: [rosterWire],
			currentUserRole: 'creator',
			currentUserId: 'u1',
			activity: [
				{
					kind: 'completed' as const,
					title: 'Bins',
					actorName: 'Ann Rivera',
					targetName: null,
					at: '2026-02-01T09:00:00.000Z'
				}
			],
			moduleSwitches: { board: false, kids: true, groceries: true, meals: true },
			hiddenDashboardModules: ['verse'],
			activeInvite: {
				code: 'LIVE000001',
				useCount: 2,
				maxUses: 5,
				expiresAt: '2099-01-01T00:00:00.000Z'
			},
			inviteCreatedBy: 'Ann',
			planUsage: {
				tierName: null,
				aiUsed: 0,
				aiLimit: 10,
				familiesUsed: 1,
				familyLimit: 1,
				members: 1,
				memberLimit: 6,
				archivedRetentionDays: 90,
				exportImportEnabled: true
			}
		};
		expect(FamilyDetailResponse.parse(body)).toEqual(body);
	});

	it('describes the create, update and member acknowledgements', () => {
		expect(CreateFamilyResponse.parse({ family: familyWire })).toEqual({ family: familyWire });
		expect(UpdateFamilyResponse.parse({ success: true, family: familyWire })).toEqual({
			success: true,
			family: familyWire
		});
		expect(MemberUpdatedResponse.parse({ success: true })).toEqual({ success: true });
		expect(InviteSentResponse.parse({ success: true })).toEqual({ success: true });
		expect(InviteLinkResponse.parse({ success: true, link: '/x' })).toEqual({
			success: true,
			link: '/x'
		});
		expect(MemberUpdatedResponse.safeParse({ success: 'yes' }).success).toBe(false);
	});

	it('describes the child acknowledgement', () => {
		const body = {
			success: true as const,
			user: { id: 'u9', firstName: 'Mia', lastName: 'Nakamura', email: 'mia@kids.example.test' }
		};
		expect(ChildAddedResponse.parse(body)).toEqual(body);
	});

	it('describes the invite codes, with a null cap but a numeric use count', () => {
		const body = {
			canManageInvites: true,
			codes: [
				{
					code: 'BBB',
					useCount: 0,
					maxUses: null,
					expiresAt: '2000-01-01T00:00:00.000Z',
					createdBy: null
				}
			]
		};
		expect(InviteCodesResponse.parse(body)).toEqual(body);
		expect(
			InviteCodesResponse.safeParse({ ...body, codes: [{ ...body.codes[0], useCount: null }] })
				.success
		).toBe(false);
	});

	it('describes mint, preview, roster and search', () => {
		expect(
			MintInviteResponse.parse({
				code: 'abc1234567',
				expiresAt: '2026-11-18T12:00:00.000Z',
				inviteUrl: '/family/join/abc1234567'
			})
		).toEqual({
			code: 'abc1234567',
			expiresAt: '2026-11-18T12:00:00.000Z',
			inviteUrl: '/family/join/abc1234567'
		});
		expect(
			InvitePreviewResponse.parse({
				family: { id: 'fam-1', name: 'Riveras', color: null },
				isAlreadyMember: false
			})
		).toEqual({
			family: { id: 'fam-1', name: 'Riveras', color: null },
			isAlreadyMember: false
		});
		expect(RosterResponse.parse({ familyId: null, members: [] })).toEqual({
			familyId: null,
			members: []
		});
		expect(RosterResponse.parse({ familyId: 'fam-1', members: [rosterWire] }).familyId).toBe(
			'fam-1'
		);
		const masked = { id: 'u1', firstName: 'Ann', lastName: 'Lee', email: 'a••@x••••' };
		expect(MemberSearchResponse.parse({ users: [masked] })).toEqual({ users: [masked] });
		const full = { id: 'u1', firstName: 'Bob', lastName: 'Stone', email: 'bob@x.com' };
		expect(FamilySearchResponse.parse({ users: [full] })).toEqual({ users: [full] });
		expect(InvitableUserResponse.parse(full)).toEqual(full);
	});

	it('describes the two error bodies', () => {
		expect(FamilyErrorResponse.parse({ error: 'Family not found' })).toEqual({
			error: 'Family not found'
		});
		expect(
			InviteEmailErrorResponse.parse({ success: false, error: INVITE_INVALID_EMAIL_MESSAGE })
		).toEqual({ success: false, error: 'Invalid email' });
		expect(
			InviteEmailErrorResponse.parse({ success: false, error: INVITE_NAMES_MESSAGE })
		).toEqual({ success: false, error: 'First and last name are required' });
	});
});


type ClampCase = [string, JsonValue | undefined, number];

describe('the mint body\'s two count clamps (moved from family.invites.rules.ts)', () => {
	it('mints at the shared default when the body names neither count', () => {
		expect(shareInvitePlan(undefined, undefined)).toEqual({
			days: DEFAULT_INVITE_DAYS,
			maxUses: DEFAULT_INVITE_MAX_USES
		});
	});
});

describe('clampInviteDays (1-30, default 7)', () => {
	// Legacy families.test.ts:469-481, expiresInDaysCases.
	it.each<ClampCase>([
		['a missing value falls back to 7 days', undefined, 7],
		['null falls back to 7 days', null, 7],
		['an empty string falls back to 7 days', '', 7],
		['a non-numeric string falls back to 7 days', 'never', 7],
		['zero clamps up to 1 day', 0, 1],
		['a negative clamps up to 1 day', -5, 1],
		['an in-range value passes through', 14, 14],
		['a numeric string passes through', '14', 14],
		['a fraction truncates', 14.9, 14],
		['a huge value clamps down to 30 days', 1000, 30],
		['the upper edge is allowed', 30, 30],
		['one past the upper edge clamps', 31, 30],
		['the lower edge is allowed', 1, 1]
	])('%s', (_what, input, expected) => {
		expect(clampInviteDays(input)).toBe(expected);
	});
});

describe('clampInviteUses (1-50, default 10)', () => {
	// Legacy families.test.ts:489-495, maxUsesCases.
	it.each<ClampCase>([
		['a missing value falls back to 10 uses', undefined, 10],
		['NaN falls back to 10 uses', Number.NaN, 10],
		['zero clamps up to 1 use', 0, 1],
		['an in-range value passes through', 25, 25],
		['a huge value clamps down to 50 uses', 100000, 50],
		['a numeric string passes through', '3', 3],
		['the upper edge is allowed', 50, 50],
		['one past the upper edge clamps', 51, 50],
		['a boolean is junk and falls back', true, 10]
	])('%s', (_what, input, expected) => {
		expect(clampInviteUses(input)).toBe(expected);
	});
});

describe('shareInvitePlan clamps each count on its own', () => {
	it('reads the golden mint bodies: huge, zero and numeric strings', () => {
		expect(shareInvitePlan(100, 999)).toEqual({ days: 30, maxUses: 50 });
		expect(shareInvitePlan(0, 0)).toEqual({ days: 1, maxUses: 1 });
		expect(shareInvitePlan('3', '3')).toEqual({ days: 3, maxUses: 3 });
	});

	it('does not let one junk count disturb the other', () => {
		expect(shareInvitePlan('soon', 5)).toEqual({ days: 7, maxUses: 5 });
		expect(shareInvitePlan(2, null)).toEqual({ days: 2, maxUses: 10 });
	});
});
