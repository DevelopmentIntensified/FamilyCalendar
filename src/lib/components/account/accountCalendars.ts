/**
 * #251: the Account > Calendar section lists the calendar of every family
 * the user belongs to, each named after its own family (not just the first).
 */
export function familyCalendarEntries(
	memberships: ReadonlyArray<{ family: { id: string; name: string | null } }>,
	familyCals: ReadonlyArray<{ id: string; familyId: string | null }>
): { id: string; name: string }[] {
	const familyNames = new Map(memberships.map((m) => [m.family.id, m.family.name]));
	return familyCals
		.filter((fc) => fc.familyId !== null && familyNames.has(fc.familyId))
		.map((fc) => ({
			id: fc.id,
			name: familyNames.get(fc.familyId as string) || 'Family Calendar'
		}));
}
