/**
 * Pure role rules: the two vocabularies and the permission table. Expected
 * values come from CONTEXT.md (role is the permission, Member Type is profile)
 * and the README Invariants, never from running the code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	canChangeRole,
	canManageInvites,
	canManageMembers,
	canPromoteToCreator,
	canSetMemberType,
	DEFAULT_FAMILY_ROLE,
	DEFAULT_MEMBER_TYPE,
	FAMILY_ROLES,
	isFamilyRole,
	isMemberType,
	MEMBER_TYPES,
	meetsRole,
	PERMISSION_REFUSED_MESSAGE,
	requireRole,
	roleRank,
	type FamilyRole
} from './family.roles.rules';

type RoleInput = string | null | undefined;

describe('the two vocabularies', () => {
	it('keeps the roles highest first, which is the order the 400 copy lists them', () => {
		expect(FAMILY_ROLES).toEqual(['creator', 'admin', 'member']);
	});

	it('keeps the Member Types', () => {
		expect(MEMBER_TYPES).toEqual(['parent', 'child', 'member']);
	});

	it('defaults a plain person to role member and Member Type member', () => {
		expect([DEFAULT_FAMILY_ROLE, DEFAULT_MEMBER_TYPE]).toEqual(['member', 'member']);
	});

	it.each<[string, boolean]>([
		['creator', true],
		['admin', true],
		['member', true],
		['owner', false],
		['Admin', false],
		['parent', false],
		['', false]
	])('isFamilyRole(%j) → %s (case-sensitive; a Member Type is not a role)', (value, expected) => {
		expect(isFamilyRole(value)).toBe(expected);
	});

	it.each<[string, boolean]>([
		['parent', true],
		['child', true],
		['member', true],
		['creator', false],
		['adult', false],
		['Parent', false],
		['', false]
	])('isMemberType(%j) → %s (a role is not a Member Type)', (value, expected) => {
		expect(isMemberType(value)).toBe(expected);
	});
});

describe('roleRank', () => {
	it.each<[RoleInput, number]>([
		['creator', 2],
		['admin', 1],
		['member', 0],
		['owner', -1],
		['', -1],
		[null, -1],
		[undefined, -1]
	])('roleRank(%j) → %i', (role, expected) => {
		expect(roleRank(role)).toBe(expected);
	});
});

describe('meetsRole', () => {
	it.each<[RoleInput, 'creator' | 'admin', boolean]>([
		['creator', 'creator', true],
		['admin', 'creator', false],
		['member', 'creator', false],
		['creator', 'admin', true],
		['admin', 'admin', true],
		['member', 'admin', false],
		['owner', 'admin', false],
		[null, 'admin', false],
		[undefined, 'creator', false]
	])('meetsRole(%j, %s) → %s', (role, min, expected) => {
		expect(meetsRole(role, min)).toBe(expected);
	});
});

describe('who may do what (README Invariants: creator/admin only)', () => {
	it.each<[RoleInput, boolean]>([
		['creator', true],
		['admin', true],
		['member', false],
		[null, false],
		[undefined, false]
	])('role %j may mint, list and revoke invites and add members: %s', (role, expected) => {
		expect(canManageInvites(role)).toBe(expected);
		expect(canManageMembers(role)).toBe(expected);
		expect(canSetMemberType(role)).toBe(expected);
	});

	it.each<[RoleInput, boolean]>([
		['creator', true],
		['admin', false],
		['member', false],
		[null, false]
	])('role %j may promote to creator: %s', (role, expected) => {
		expect(canPromoteToCreator(role)).toBe(expected);
	});

	it.each<[RoleInput, FamilyRole, boolean]>([
		['creator', 'creator', true],
		['admin', 'creator', false],
		['member', 'creator', false],
		['creator', 'admin', true],
		['admin', 'admin', true],
		['member', 'admin', false],
		['creator', 'member', true],
		['admin', 'member', true],
		['member', 'member', false],
		[null, 'member', false]
	])('role %j changing someone to %s: %s', (actorRole, newRole, expected) => {
		expect(canChangeRole(actorRole, newRole)).toBe(expected);
	});
});

describe('requireRole: the generic 403 for doors without their own copy', () => {
	it.each<[RoleInput, 'creator' | 'admin', boolean]>([
		['creator', 'creator', true],
		['admin', 'creator', false],
		['admin', 'admin', true],
		['member', 'admin', false],
		[null, 'admin', false],
		[undefined, 'creator', false]
	])('requireRole(%j, %s) → %s', (role, min, allowed) => {
		expect(requireRole(role, min)).toEqual(
			allowed ? null : { status: 403, message: PERMISSION_REFUSED_MESSAGE }
		);
	});

	it('names the legacy copy verbatim', () => {
		expect(PERMISSION_REFUSED_MESSAGE).toBe('You do not have permission to perform this action');
	});
});

describe('Member Type never grants a permission', () => {
	// A roster row carries both fields; every permission is derived from the
	// role alone, so no (role, Member Type) pair may answer differently from
	// the role's own row in the table above.
	const rows = FAMILY_ROLES.flatMap((role) =>
		MEMBER_TYPES.map((memberType) => ({ role, memberType }))
	);

	it.each(rows)('role $role with Member Type $memberType answers by role only', (row) => {
		const manager = row.role !== 'member';
		expect(canManageInvites(row.role)).toBe(manager);
		expect(canManageMembers(row.role)).toBe(manager);
		expect(canSetMemberType(row.role)).toBe(manager);
		expect(canPromoteToCreator(row.role)).toBe(row.role === 'creator');
	});

	it('a Member Type label is not a role and carries no rank', () => {
		for (const type of MEMBER_TYPES.filter((candidate) => candidate !== 'member')) {
			expect(roleRank(type)).toBe(-1);
			expect(canManageMembers(type)).toBe(false);
		}
	});
});
