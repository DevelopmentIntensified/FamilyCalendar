/**
 * family display rules: the pure helpers every roster surface shares: who the
 * viewer may edit or remove, how a person is named, how a role pill looks.
 *
 * The permission legs are the same role rules the server enforces
 * (`family.roles.rules.ts`), so a button is shown exactly when the server would
 * accept the click: creators may act on anyone but themselves, admins only on
 * plain members, and nobody removes themselves or a creator.
 *
 * Doc: ./README.md#public-interface
 */
import { canManageMembers, meetsRole } from './family.roles.rules';

/** The roster fields these helpers read; every one may be missing on a half-loaded row. */
export type DisplayMember = {
	readonly userId: string;
	readonly role?: string | null;
	readonly firstName?: string | null;
	readonly lastName?: string | null;
	readonly email?: string | null;
};

/** Whether the viewer may change this member's role (never their own). */
export function canEditRole(
	member: DisplayMember,
	currentUserRole: string | null | undefined,
	currentUserId: string | null | undefined
): boolean {
	return (
		canManageMembers(currentUserRole) &&
		member.userId !== currentUserId &&
		(meetsRole(currentUserRole, 'creator') || member.role === 'member')
	);
}

/** Whether the viewer may remove this member: never themselves, never a creator. */
export function canRemove(
	member: DisplayMember,
	currentUserRole: string | null | undefined,
	currentUserId: string | null | undefined
): boolean {
	return (
		canManageMembers(currentUserRole) &&
		member.userId !== currentUserId &&
		member.role !== 'creator' &&
		(meetsRole(currentUserRole, 'creator') || member.role === 'member')
	);
}

/** Tailwind classes for the role pill: amber creator, emerald admin, blue everyone else. */
export function rolePillClass(role: string): string {
	return (
		'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ' +
		(role === 'creator'
			? 'bg-amber-100 text-amber-700'
			: role === 'admin'
				? 'bg-emerald-100 text-emerald-700'
				: 'bg-blue-100 text-blue-700')
	);
}

/** Full name, else the email, else the placeholder. */
export function memberDisplayName(member: DisplayMember): string {
	return (
		[member.firstName, member.lastName].filter(Boolean).join(' ') ||
		member.email ||
		'Family member'
	);
}
