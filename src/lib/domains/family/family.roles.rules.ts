/**
 * family roles rules: the two closed vocabularies and who may do what.
 *
 * A Family Member has two separate fields that are never interchangeable
 * (ADR-0001): the membership **role** (`creator | admin | member`) is the
 * permission; the **Member Type** (`parent | child | member`) is the personal
 * profile and gates nothing. Every function here takes a role and nothing
 * else, so a Member Type cannot leak into a permission check by accident.
 *
 * Roles arrive from the `familyMembers.role` column, which is nullable text:
 * `null` means "no membership" to every rule here.
 *
 * Doc: ./README.md#invariants
 */

/** The membership roles, highest first. The 400 copy lists them in this order. */
export const FAMILY_ROLES = ['creator', 'admin', 'member'] as const;

/** The Member Type profile labels. Profile only: nothing is gated on them. */
export const MEMBER_TYPES = ['parent', 'child', 'member'] as const;

export type FamilyRole = (typeof FAMILY_ROLES)[number];
export type MemberType = (typeof MEMBER_TYPES)[number];

/** The role a plain family member gets when nobody says otherwise. */
export const DEFAULT_FAMILY_ROLE: FamilyRole = 'member';

/** The Member Type a person gets when nobody says otherwise. */
export const DEFAULT_MEMBER_TYPE: MemberType = 'member';

/** A rule's "no": the HTTP status the wire answers with and its exact legacy copy. */
export type FamilyRefusal = {
	readonly status: 400 | 403 | 404;
	readonly message: string;
};

export function isFamilyRole(value: string): value is FamilyRole {
	return FAMILY_ROLES.some((role) => role === value);
}

export function isMemberType(value: string): value is MemberType {
	return MEMBER_TYPES.some((type) => type === value);
}

/** creator 2, admin 1, member 0; anything else (including no role) is -1. */
export function roleRank(role: string | null | undefined): number {
	switch (role) {
		case 'creator':
			return 2;
		case 'admin':
			return 1;
		case 'member':
			return 0;
		default:
			return -1;
	}
}

/** Whether the role is at least `min`; a missing or unknown role never is. */
export function meetsRole(role: string | null | undefined, min: 'creator' | 'admin'): boolean {
	return roleRank(role) >= roleRank(min);
}

/** The one 403 every role-gated mutation without a door of its own answers. */
export const PERMISSION_REFUSED_MESSAGE = 'You do not have permission to perform this action';

/**
 * The authorization leg of a mutation: null when the role is at least `min`,
 * else the generic refusal. Doors with their own copy (invites, member adds)
 * and multi-step orders (role changes) use the primitives above instead.
 */
export function requireRole(
	role: string | null | undefined,
	min: 'creator' | 'admin'
): FamilyRefusal | null {
	return meetsRole(role, min)
		? null
		: { status: 403, message: PERMISSION_REFUSED_MESSAGE };
}

/** Minting, listing and revoking invite codes is creator/admin only. */
export function canManageInvites(role: string | null | undefined): boolean {
	return meetsRole(role, 'admin');
}

/** Adding a member (direct, emailed, link, child) is creator/admin only. */
export function canManageMembers(role: string | null | undefined): boolean {
	return meetsRole(role, 'admin');
}

/** Only the creator promotes someone to creator. */
export function canPromoteToCreator(role: string | null | undefined): boolean {
	return meetsRole(role, 'creator');
}

/**
 * The authorization leg of a role change, once the target is known to be a
 * non-creator other than the actor: promoting to `creator` needs the creator,
 * any other role needs an admin or the creator.
 */
export function canChangeRole(actorRole: string | null | undefined, newRole: FamilyRole): boolean {
	return newRole === 'creator' ? canPromoteToCreator(actorRole) : meetsRole(actorRole, 'admin');
}

/** Setting a Member Type is admin-only, and never touches the role. */
export function canSetMemberType(actorRole: string | null | undefined): boolean {
	return meetsRole(actorRole, 'admin');
}
