/**
 * family members rules: every refusal a membership change can meet, in the
 * order the legacy code met them, with each door's own copy.
 *
 * Each function takes the facts the service has already read (the actor's and
 * the target's role in THIS family, never "the user's first membership row")
 * and answers the first refusal or null. The order is part of the wire: the
 * goldens pin which message wins when two rules would both refuse.
 *
 * Doc: ./README.md#invariants
 */
import { isEmailAddress } from '$lib/kernel/validation/validators';
import {
	canChangeRole,
	canManageMembers,
	canSetMemberType,
	isFamilyRole,
	isMemberType,
	PERMISSION_REFUSED_MESSAGE,
	type FamilyRefusal
} from './family.roles.rules';

/** The doors that add or invite someone, or mint/revoke a code: creator/admin only. */
export type ManagerDoor = 'direct' | 'child' | 'email' | 'link' | 'mint' | 'revoke';

/** The doors any member of the family may use: search the directory, read the roster. */
export type MemberDoor = 'search' | 'roster';

const MANAGER_COPY: Record<ManagerDoor, { notMember: string; notManager: string }> = {
	direct: {
		notMember: 'You are not a member of this family',
		notManager: 'Only the family creator or an admin can add members directly'
	},
	child: {
		notMember: 'You are not a member of this family',
		notManager: 'Only the family creator or an admin can add members'
	},
	email: {
		notMember: 'Not a member of this family',
		notManager: 'Only the family creator or an admin can send invitations'
	},
	link: {
		notMember: 'Not a member of this family',
		notManager: 'Only the family creator or an admin can generate invite links'
	},
	mint: {
		notMember: 'You are not a member of this family',
		notManager: 'Only the family creator or an admin can create invitations'
	},
	revoke: {
		notMember: 'You are not a member of this family',
		notManager: 'Only the family creator or an admin can revoke invitations'
	}
};

const MEMBER_COPY: Record<MemberDoor, string> = {
	search: 'You do not have permission to search in this family',
	roster: 'Not a member of this family'
};

/**
 * The creator/admin gate of one door. `role` is the actor's role in the family
 * named by the URL or body; null is "not a member". A plain member is refused
 * with the door's own message, not a shared one.
 */
export function managerRefusal(door: ManagerDoor, role: string | null): FamilyRefusal | null {
	if (role === null) return { status: 403, message: MANAGER_COPY[door].notMember };
	if (!canManageMembers(role)) return { status: 403, message: MANAGER_COPY[door].notManager };
	return null;
}

/** The member gate of one door: any role in the family will do, null is refused. */
export function memberRefusal(door: MemberDoor, role: string | null): FamilyRefusal | null {
	return role === null ? { status: 403, message: MEMBER_COPY[door] } : null;
}

/** The facts a role change is decided on. `role` is the requested role as the body spelled it. */
export type RoleChange = {
	readonly actorId: string;
	readonly actorRole: string | null;
	readonly userId: string;
	readonly targetRole: string | null;
	readonly role: string;
};

/**
 * The first refusal of `PATCH .../members/{userId}` for a role, in legacy
 * order: both fields present, the role vocabulary, the actor is in the
 * family, not yourself, the target is in the family, the creator is untouchable,
 * then the authorization leg (only the creator promotes to creator; anyone
 * else needs an admin).
 */
export function roleChangeRefusal(change: RoleChange): FamilyRefusal | null {
	if (!change.userId || !change.role) {
		return { status: 400, message: 'User ID and role are required' };
	}
	if (!isFamilyRole(change.role)) {
		return { status: 400, message: 'Role must be creator, admin, or member' };
	}
	if (!change.actorRole) return { status: 403, message: 'You do not have permission' };
	if (change.userId === change.actorId) {
		return { status: 400, message: 'Cannot change your own role' };
	}
	if (!change.targetRole) return { status: 400, message: 'Member not found' };
	if (change.targetRole === 'creator') {
		return { status: 403, message: "Cannot change the family creator's role" };
	}
	if (!canChangeRole(change.actorRole, change.role)) {
		return change.role === 'creator'
			? { status: 403, message: 'Only the creator can promote to creator' }
			: { status: 403, message: 'You do not have permission' };
	}
	return null;
}

/** The facts a Member Type change is decided on. */
export type MemberTypeChange = {
	readonly actorRole: string | null;
	readonly userId: string;
	readonly targetRole: string | null;
	readonly memberType: string;
};

/**
 * The first refusal of `PATCH .../members/{userId}` for a Member Type:
 * both fields present, the Member Type vocabulary, the actor is an admin, the
 * target is in the family. Never touches the role.
 */
export function memberTypeRefusal(change: MemberTypeChange): FamilyRefusal | null {
	if (!change.userId || !change.memberType) {
		return { status: 400, message: 'User ID and member type are required' };
	}
	if (!isMemberType(change.memberType)) {
		return { status: 400, message: 'Member type must be parent, child, or member' };
	}
	if (!canSetMemberType(change.actorRole)) return { status: 403, message: PERMISSION_REFUSED_MESSAGE };
	if (!change.targetRole) return { status: 400, message: 'Member not found' };
	return null;
}

/** The facts a removal is decided on. */
export type MemberRemoval = {
	readonly actorRole: string | null;
	readonly userId: string;
	readonly targetRole: string | null;
};

/**
 * The first refusal of `DELETE .../members/{userId}`: a user id, then the
 * creator is untouchable (checked BEFORE who is asking), then the actor is an
 * admin. A target who is not in the family is NOT refused: the delete is
 * idempotent and answers success (owner question Q-027, answered A: keep).
 */
export function removalRefusal(removal: MemberRemoval): FamilyRefusal | null {
	if (!removal.userId) return { status: 400, message: 'User ID is required' };
	if (removal.targetRole === 'creator') {
		return { status: 403, message: 'Cannot remove the family creator' };
	}
	if (!canManageMembers(removal.actorRole)) return { status: 403, message: PERMISSION_REFUSED_MESSAGE };
	return null;
}

/** What a direct add checks about the person being added, after the actor's gate. */
export type DirectAddFacts = {
	readonly userExists: boolean;
	readonly alreadyMember: boolean;
};

/** The first refusal of a direct add once the actor is allowed: unknown user, then existing member. */
export function directAddRefusal(facts: DirectAddFacts): FamilyRefusal | null {
	if (!facts.userExists) return { status: 404, message: 'User not found' };
	if (facts.alreadyMember) return { status: 400, message: 'User is already a member of this family' };
	return null;
}

/** The 400 for a child's email that another account already holds (`users.email` is unique). */
export const CHILD_EMAIL_TAKEN_MESSAGE =
	'That email is already in use. Each child needs their own email address.';

/** The child form's three fields, after the boundary read them as strings. */
export type ChildDetails = {
	readonly firstName: string;
	readonly lastName: string;
	readonly email: string;
};

/**
 * The child door's own address pattern, exactly as the legacy route held it:
 * anything shaped `x@y.z` with no whitespace and no second `@`. It is looser
 * than the kernel's `isEmailAddress` (which the two emailed-invite doors use):
 * it accepts `a@b.c`, `a..b@c.de` and an underscore in the domain, and it
 * rejects nothing the kernel pattern accepts except quoted local parts. Kept
 * apart on purpose: unifying the two is a wire change, so it is an owner
 * question (see the report), not a refactor.
 */
const CHILD_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The child form's field refusals, in the legacy order: first name, last name,
 * then the address. The legacy route checked `!firstName || !firstName.trim()`
 * for the names and `CHILD_EMAIL_PATTERN` for the email. The email is checked
 * as posted (padding fails the pattern) — the service lowercases and trims it
 * only once it is accepted.
 */
export function childDetailsRefusal(details: ChildDetails): FamilyRefusal | null {
	if (details.firstName.trim().length === 0) {
		return { status: 400, message: 'First name is required' };
	}
	if (details.lastName.trim().length === 0) {
		return { status: 400, message: 'Last name is required' };
	}
	if (!CHILD_EMAIL_PATTERN.test(details.email)) {
		return { status: 400, message: 'A valid email is required' };
	}
	return null;
}

/** The emailed-invite target: an address and both names. */
export type InviteTarget = {
	readonly email: string;
	readonly firstName: string;
	readonly lastName: string;
};

/** The emailed invite's one 400 body for an address that does not parse. */
export const INVITE_INVALID_EMAIL_MESSAGE = 'Invalid email';

/** The emailed invite's one 400 body for a missing name. */
export const INVITE_NAMES_MESSAGE = 'First and last name are required';

/**
 * The emailed invite and invite-link form: the address first, then both names.
 * Legacy truthiness is kept: a whitespace-only name is present (`' '` passes);
 * only an absent or empty string is refused.
 */
export function inviteTargetRefusal(target: InviteTarget): FamilyRefusal | null {
	if (!isEmailAddress(target.email)) {
		return { status: 400, message: INVITE_INVALID_EMAIL_MESSAGE };
	}
	if (!target.firstName || !target.lastName) {
		return { status: 400, message: INVITE_NAMES_MESSAGE };
	}
	return null;
}

/**
 * Parental-consent attestation (#190): a child account is created only on an
 * explicit `true`, enforced on the server so a scripted POST cannot skip the
 * checkbox. This records the parent's acknowledgment; it is not a verified
 * consent flow.
 */
export function consentRefusal(consentAcknowledged: boolean): FamilyRefusal | null {
	return consentAcknowledged
		? null
		: {
				status: 400,
				message:
					'Please confirm you are this child’s parent or guardian and consent to creating their account.'
			};
}

/** The `added_to_family` Alert a direct add writes to the person who was added. */
export type AddedToFamilyAlert = {
	readonly type: 'added_to_family';
	readonly actorName: string;
	readonly message: string;
	readonly link: string;
};

/** The Alert copy: "{actor} added you to the family." linking to that family. */
export function addedToFamilyAlert(
	actor: { readonly firstName: string; readonly lastName: string },
	familyId: string
): AddedToFamilyAlert {
	const actorName = `${actor.firstName} ${actor.lastName}`.trim();
	return {
		type: 'added_to_family',
		actorName,
		message: `${actorName} added you to the family.`,
		link: `/family/${familyId}`
	};
}
