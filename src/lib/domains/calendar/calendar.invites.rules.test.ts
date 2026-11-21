/**
 * Invitation rules, carried from
 * `src/lib/server/utils/eventInvites.test.ts:24-105` (the recognized/unknown
 * member-id contract, #274 promotion, non-array payloads) and
 * `src/lib/server/db/actions/events.ts:151-169` (`normalizeInvites`).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { isKnownInvitee, normalizeInvites, resolveInvites } from './calendar.invites.rules';

const SELF_ID = 'user-self';
const MEMBER_ID = 'user-member';
const STRANGER_ID = 'user-stranger';
const context = { userId: SELF_ID, rosterUserIds: [MEMBER_ID] };

describe('resolveInvites (eventInvites.test.ts:24-105)', () => {
	it.each([
		[
			'drops unrecognized user ids entirely (never stored as guest names)',
			[{ value: STRANGER_ID, isUser: true, inviteType: 'optional' }],
			[]
		],
		[
			'keeps the caller themself as a member invite with the requested type',
			[{ value: SELF_ID, isUser: true, inviteType: 'required' }],
			[{ userId: SELF_ID, inviteType: 'required' }]
		],
		[
			'keeps roster member ids as member invites',
			[{ value: MEMBER_ID, isUser: true, inviteType: 'required' }],
			[{ userId: MEMBER_ID, inviteType: 'required' }]
		],
		[
			'defaults an unrecognized member-invite type to optional',
			[{ value: MEMBER_ID, isUser: true, inviteType: 'nonsense' }],
			[{ userId: MEMBER_ID, inviteType: 'optional' }]
		],
		[
			'keeps plain guest-name strings and drops blanks',
			['Jane Doe', '  ', ''],
			[{ name: 'Jane Doe', inviteType: 'optional' }]
		],
		[
			'treats non-user object entries as guest names',
			[{ value: 'Jane' }],
			[{ name: 'Jane', inviteType: 'optional' }]
		],
		[
			'keeps members and guests together, dropping stranger ids in a mixed payload',
			['Guest Person', { value: STRANGER_ID, isUser: true, inviteType: 'required' }, { value: MEMBER_ID, isUser: true, inviteType: 'required' }],
			[
				{ name: 'Guest Person', inviteType: 'optional' },
				{ userId: MEMBER_ID, inviteType: 'required' }
			]
		],
		[
			'promotes a guest value that is a roster member id to a member invite (#274)',
			[{ value: MEMBER_ID, isUser: false, inviteType: 'required' }, MEMBER_ID],
			[
				{ userId: MEMBER_ID, inviteType: 'required' },
				{ userId: MEMBER_ID, inviteType: 'optional' }
			]
		],
		[
			'promotes a guest value that is the caller id to a member invite (#274)',
			[{ value: SELF_ID, isUser: false }],
			[{ userId: SELF_ID, inviteType: 'optional' }]
		],
		[
			'a guest is always optional even when it asks for required',
			[{ value: 'Grandma', isUser: false, inviteType: 'required' }],
			[{ name: 'Grandma', inviteType: 'optional' }]
		],
		['drops a non-string or blank attendee value', [{ value: 5 }, { value: '   ' }], []],
		['drops a non-object, non-string entry', [42, null], []]
	])('%s', (_name, raw, expected) => {
		expect(resolveInvites(raw, context)).toEqual(expected);
	});

	it('without a roster only the caller themself is a known member', () => {
		expect(isKnownInvitee(SELF_ID, SELF_ID, null)).toBe(true);
		expect(isKnownInvitee(MEMBER_ID, SELF_ID, null)).toBe(false);
		expect(resolveInvites([{ value: MEMBER_ID, isUser: true }], { userId: SELF_ID, rosterUserIds: null })).toEqual(
			[]
		);
		expect(resolveInvites([MEMBER_ID], { userId: SELF_ID, rosterUserIds: null })).toEqual([
			{ name: MEMBER_ID, inviteType: 'optional' }
		]);
	});

	it.each([[null], ['Jane'], [[]]] satisfies [unknown][])(
		'returns [] for the non-array payload %j',
		(raw) => {
			expect(resolveInvites(raw, context)).toEqual([]);
		}
	);
});

describe('normalizeInvites (events.ts:151-169)', () => {
	it('keeps the legacy string/object split, including a name-only object', () => {
		expect(
			normalizeInvites([' Grand ', { userId: 'u1', inviteType: 'required' }, { name: 'Grandma' }])
		).toEqual([
			{ name: 'Grand', inviteType: 'optional' },
			{ userId: 'u1', inviteType: 'required' },
			{ name: 'Grandma', inviteType: 'optional' }
		]);
	});

	it('has no roster, so a member id sent as a guest name stays a guest', () => {
		expect(normalizeInvites([MEMBER_ID])).toEqual([{ name: MEMBER_ID, inviteType: 'optional' }]);
	});

	it('returns [] for a non-array payload', () => {
		expect(normalizeInvites(null)).toEqual([]);
		expect(normalizeInvites('Grandma')).toEqual([]);
	});
});
