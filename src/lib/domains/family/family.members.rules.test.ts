/**
 * Pure membership rules: every refusal one membership door can answer, in the
 * order the legacy code met them, with the door's own copy. The expected
 * values are the legacy copy the goldens pin (`family.http.db.test.ts`) and
 * the order the legacy service enforced (`familyData.ts`), never the code's
 * current output.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { FAMILY_ROLES, MEMBER_TYPES, type FamilyRefusal } from './family.roles.rules';
import {
	addedToFamilyAlert,
	childDetailsRefusal,
	consentRefusal,
	directAddRefusal,
	inviteTargetRefusal,
	managerRefusal,
	memberRefusal,
	memberTypeRefusal,
	removalRefusal,
	roleChangeRefusal,
	type ManagerDoor,
	type MemberDoor
} from './family.members.rules';

const refusal = (status: 400 | 403 | 404, message: string): FamilyRefusal => ({ status, message });

const genericNoPermission = refusal(403, 'You do not have permission to perform this action');

describe('managerRefusal: creator/admin only, each door with its own copy', () => {
	it.each<[ManagerDoor, string, string]>([
		[
			'direct',
			'You are not a member of this family',
			'Only the family creator or an admin can add members directly'
		],
		[
			'child',
			'You are not a member of this family',
			'Only the family creator or an admin can add members'
		],
		['email', 'Not a member of this family', 'Only the family creator or an admin can send invitations'],
		[
			'link',
			'Not a member of this family',
			'Only the family creator or an admin can generate invite links'
		],
		[
			'mint',
			'You are not a member of this family',
			'Only the family creator or an admin can create invitations'
		],
		[
			'revoke',
			'You are not a member of this family',
			'Only the family creator or an admin can revoke invitations'
		]
	])('%s: a non-member hears %j, a plain member %j', (door, notMember, notManager) => {
		expect(managerRefusal(door, null)).toEqual(refusal(403, notMember));
		expect(managerRefusal(door, 'member')).toEqual(refusal(403, notManager));
	});

	it.each<[ManagerDoor, string | null, boolean]>([
		['direct', 'creator', true],
		['direct', 'admin', true],
		['direct', 'member', false],
		['child', 'admin', true],
		['child', 'member', false],
		['email', 'creator', true],
		['link', 'admin', true],
		['mint', 'admin', true],
		['revoke', 'creator', true],
		['mint', 'owner', false],
		['mint', null, false]
	])('%s with role %j → %s', (door, role, allowed) => {
		expect(managerRefusal(door, role) === null).toBe(allowed);
	});
});

describe('memberRefusal: any member may search or read the roster', () => {
	it.each<[MemberDoor, string]>([
		['search', 'You do not have permission to search in this family'],
		['roster', 'Not a member of this family']
	])('%s refuses a non-member with its own copy', (door, message) => {
		expect(memberRefusal(door, null)).toEqual(refusal(403, message));
	});

	it.each(FAMILY_ROLES)('role %s may search and read the roster', (role) => {
		expect(memberRefusal('search', role)).toBeNull();
		expect(memberRefusal('roster', role)).toBeNull();
	});
});

describe('roleChangeRefusal: the legacy order, and the first refusal wins', () => {
	const change = (overrides: Partial<Parameters<typeof roleChangeRefusal>[0]> = {}) => ({
		actorId: 'actor-1',
		actorRole: 'creator',
		userId: 'target-2',
		targetRole: 'member',
		role: 'admin',
		...overrides
	});

	it('allows the creator to hand out any role to a plain member', () => {
		expect(roleChangeRefusal(change())).toBeNull();
	});

	it.each<[string, Parameters<typeof roleChangeRefusal>[0], FamilyRefusal]>([
		[
			'no user id',
			change({ userId: '' }),
			refusal(400, 'User ID and role are required')
		],
		[
			'no role',
			change({ role: '' }),
			refusal(400, 'User ID and role are required')
		],
		[
			'an unknown role, before the actor is checked',
			change({ role: 'owner', actorRole: null }),
			refusal(400, 'Role must be creator, admin, or member')
		],
		[
			'a non-member actor',
			change({ actorRole: null }),
			refusal(403, 'You do not have permission')
		],
		[
			'your own role, before the target is read',
			change({ userId: 'actor-1' }),
			refusal(400, 'Cannot change your own role')
		],
		[
			'a target who is not in the family',
			change({ targetRole: null }),
			refusal(400, 'Member not found')
		],
		[
			"the creator's role, even for the creator",
			change({ targetRole: 'creator', role: 'member' }),
			refusal(403, "Cannot change the family creator's role")
		],
		[
			'an admin promoting to creator',
			change({ actorRole: 'admin', role: 'creator' }),
			refusal(403, 'Only the creator can promote to creator')
		],
		[
			'a plain member demoting someone',
			change({ actorRole: 'member', role: 'member' }),
			refusal(403, 'You do not have permission')
		]
	])('%s', (_what, input, expected) => {
		expect(roleChangeRefusal(input)).toEqual(expected);
	});

	it('lets the creator promote a plain member to creator', () => {
		expect(roleChangeRefusal(change({ role: 'creator' }))).toBeNull();
	});

	it('lets an admin change a plain member between admin and member', () => {
		expect(roleChangeRefusal(change({ actorRole: 'admin', role: 'admin' }))).toBeNull();
		expect(roleChangeRefusal(change({ actorRole: 'admin', role: 'member' }))).toBeNull();
	});

	it('stops at the role refusal when the Member Type would also be refused', () => {
		// The golden's "applies the role first and stops at its first refusal".
		expect(roleChangeRefusal(change({ role: 'owner' }))).toEqual(
			refusal(400, 'Role must be creator, admin, or member')
		);
	});
});

describe('memberTypeRefusal: admin+, profile only', () => {
	const change = (overrides: Partial<Parameters<typeof memberTypeRefusal>[0]> = {}) => ({
		actorRole: 'admin',
		userId: 'target-2',
		targetRole: 'member',
		memberType: 'parent',
		...overrides
	});

	it('allows an admin to set a valid Member Type', () => {
		expect(memberTypeRefusal(change())).toBeNull();
	});

	it.each<[string, Parameters<typeof memberTypeRefusal>[0], FamilyRefusal]>([
		['no user id', change({ userId: '' }), refusal(400, 'User ID and member type are required')],
		['no Member Type', change({ memberType: '' }), refusal(400, 'User ID and member type are required')],
		[
			'an unknown Member Type, before the actor is checked',
			change({ memberType: 'adult', actorRole: 'member' }),
			refusal(400, 'Member type must be parent, child, or member')
		],
		['a plain member', change({ actorRole: 'member' }), genericNoPermission],
		['a non-member', change({ actorRole: null }), genericNoPermission],
		['a target who is not in the family', change({ targetRole: null }), refusal(400, 'Member not found')]
	])('%s', (_what, input, expected) => {
		expect(memberTypeRefusal(input)).toEqual(expected);
	});

	it('accepts parent, child and member', () => {
		for (const type of MEMBER_TYPES) {
			expect(memberTypeRefusal(change({ memberType: type }))).toBeNull();
		}
	});
});

describe('removalRefusal: the creator is refused before who is asking', () => {
	const removal = (overrides: Partial<Parameters<typeof removalRefusal>[0]> = {}) => ({
		actorRole: 'admin',
		userId: 'target-2',
		targetRole: 'member',
		...overrides
	});

	it('allows an admin to remove a plain member', () => {
		expect(removalRefusal(removal())).toBeNull();
	});

	it('refuses an empty user id', () => {
		expect(removalRefusal(removal({ userId: '' }))).toEqual(
			refusal(400, 'User ID is required')
		);
	});

	it('refuses the creator even when a non-member is asking', () => {
		expect(removalRefusal(removal({ targetRole: 'creator', actorRole: null }))).toEqual(
			refusal(403, 'Cannot remove the family creator')
		);
	});

	it.each<[string | null, FamilyRefusal]>([
		['member', genericNoPermission],
		[null, genericNoPermission],
		['owner', genericNoPermission]
	])('refuses actor role %j with the generic copy', (actorRole, expected) => {
		expect(removalRefusal(removal({ actorRole }))).toEqual(expected);
	});

	it('does NOT refuse a target who is not in the family: the delete is a no-op success (Q-027)', () => {
		expect(removalRefusal(removal({ targetRole: null }))).toBeNull();
	});
});

describe('directAddRefusal: unknown user, then existing member', () => {
	it.each<[string, { userExists: boolean; alreadyMember: boolean }, FamilyRefusal | null]>([
		['a real user who is not a member', { userExists: true, alreadyMember: false }, null],
		['an unknown user', { userExists: false, alreadyMember: false }, refusal(404, 'User not found')],
		[
			'an existing member',
			{ userExists: true, alreadyMember: true },
			refusal(400, 'User is already a member of this family')
		]
	])('%s', (_what, facts, expected) => {
		expect(directAddRefusal(facts)).toEqual(expected);
	});

	it('answers "user not found" before "already a member" when both are true', () => {
		expect(directAddRefusal({ userExists: false, alreadyMember: true })).toEqual(
			refusal(404, 'User not found')
		);
	});
});

describe('childDetailsRefusal: the legacy field order and copy', () => {
	const details = (overrides: Partial<Parameters<typeof childDetailsRefusal>[0]> = {}) => ({
		firstName: 'Mia',
		lastName: 'Nakamura',
		email: 'mia@kids.example.test',
		...overrides
	});

	it('accepts a complete child', () => {
		expect(childDetailsRefusal(details())).toBeNull();
	});

	it.each<[string, string, string, string, FamilyRefusal]>([
		['an absent first name', '', 'Mia', 'mia@kids.example.test', refusal(400, 'First name is required')],
		['a blank first name', '   ', 'Mia', 'mia@kids.example.test', refusal(400, 'First name is required')],
		['an absent last name', 'Mia', '', 'mia@kids.example.test', refusal(400, 'Last name is required')],
		['a blank last name', 'Mia', '  ', 'mia@kids.example.test', refusal(400, 'Last name is required')],
		['a malformed email', 'Mia', 'Nakamura', 'nope', refusal(400, 'A valid email is required')],
		[
			'an email without a dotted domain',
			'Mia',
			'Nakamura',
			'nope@x',
			refusal(400, 'A valid email is required')
		]
	])('%s', (_what, firstName, lastName, email, expected) => {
		expect(childDetailsRefusal(details({ firstName, lastName, email }))).toEqual(expected);
	});

	it('checks the first name before the last name and the email', () => {
		expect(childDetailsRefusal(details({ firstName: '', lastName: '', email: 'nope' }))).toEqual(
			refusal(400, 'First name is required')
		);
	});

	it('accepts the documented address', () => {
		expect(childDetailsRefusal(details({ email: 'Mia@Kids.Example.Test' }))).toBeNull();
	});

	// The legacy child route's own pattern (child/+server.ts), looser than the
	// kernel's email rule: these rows are where the two differ (owner question).
	it.each<[string, string, boolean]>([
		['a one-letter top-level domain', 'a@b.c', true],
		['consecutive dots in the local part', 'a..b@c.de', true],
		['an underscore in the domain', 'mia@kids_home.test', true],
		['padding around the address (it is checked as posted)', ' mia@kids.test ', false],
		['a second @', 'a@b@c.de', false],
		['whitespace inside', 'mia nak@kids.test', false],
		['no dot after the @', 'mia@kids', false],
		['an empty local part', '@kids.test', false]
	])('address: %s (%j) is accepted → %s', (_what, email, accepted) => {
		expect(childDetailsRefusal(details({ email })) === null).toBe(accepted);
	});
});

describe('consentRefusal: an explicit true, enforced server-side (#190)', () => {
	it('allows an explicit acknowledgment', () => {
		expect(consentRefusal(true)).toBeNull();
	});

	it('refuses false and anything that is not literally true', () => {
		const expected = refusal(
			400,
			'Please confirm you are this child’s parent or guardian and consent to creating their account.'
		);
		expect(consentRefusal(false)).toEqual(expected);
	});
});

describe('inviteTargetRefusal: the email then the two names', () => {
	const target = (overrides: Partial<Parameters<typeof inviteTargetRefusal>[0]> = {}) => ({
		email: 'guest@example.test',
		firstName: 'Guest',
		lastName: 'User',
		...overrides
	});

	it('accepts a complete invite target', () => {
		expect(inviteTargetRefusal(target())).toBeNull();
	});

	it.each<[string, string, string, string, FamilyRefusal]>([
		['a malformed email', 'not-an-email', 'Guest', 'User', refusal(400, 'Invalid email')],
		['a missing local part', '@example.test', 'Guest', 'User', refusal(400, 'Invalid email')],
		['a missing first name', 'guest@example.test', '', 'User', refusal(400, 'First and last name are required')],
		['a missing last name', 'guest@example.test', 'Guest', '', refusal(400, 'First and last name are required')]
	])('%s', (_what, email, firstName, lastName, expected) => {
		expect(inviteTargetRefusal(target({ email, firstName, lastName }))).toEqual(expected);
	});

	it('checks the email before the names', () => {
		expect(inviteTargetRefusal(target({ email: 'bad', firstName: '' }))).toEqual(
			refusal(400, 'Invalid email')
		);
	});

	it('keeps the legacy truthiness: a whitespace-only name is present', () => {
		expect(inviteTargetRefusal(target({ firstName: ' ' }))).toBeNull();
	});
});

describe('addedToFamilyAlert: the one Alert a direct add writes', () => {
	it('names the actor, the family and the link', () => {
		expect(addedToFamilyAlert({ firstName: 'Bob', lastName: 'Stone' }, 'fam-1')).toEqual({
			type: 'added_to_family',
			actorName: 'Bob Stone',
			message: 'Bob Stone added you to the family.',
			link: '/family/fam-1'
		});
	});

	it('trims the actor name rather than leaving a doubled space', () => {
		expect(addedToFamilyAlert({ firstName: 'Bob', lastName: '' }, 'fam-1')).toMatchObject({
			actorName: 'Bob',
			message: 'Bob added you to the family.'
		});
	});
});
