export type DisplayMember = {
	userId: string;
	role?: string | null;
	firstName?: string | null;
	lastName?: string | null;
	email?: string | null;
};

function isAdminRole(role: string | null | undefined): boolean {
	return role === 'creator' || role === 'admin';
}

export function canEditRole(
	member: DisplayMember,
	currentUserRole: string | null | undefined,
	currentUserId: string | null | undefined
): boolean {
	return (
		isAdminRole(currentUserRole) &&
		member.userId !== currentUserId &&
		(currentUserRole === 'creator' || member.role === 'member')
	);
}

export function canRemove(
	member: DisplayMember,
	currentUserRole: string | null | undefined,
	currentUserId: string | null | undefined
): boolean {
	return (
		isAdminRole(currentUserRole) &&
		member.userId !== currentUserId &&
		member.role !== 'creator' &&
		(currentUserRole === 'creator' || member.role === 'member')
	);
}

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

export function memberDisplayName(member: DisplayMember): string {
	return (
		[member.firstName, member.lastName].filter(Boolean).join(' ') || member.email || 'Family member'
	);
}
