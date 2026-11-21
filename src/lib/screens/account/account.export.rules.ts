/**
 * The export document's pure part: the filename, the one key order, and the
 * slice shaping the screen owns because the screen owns no tables.
 *
 * Legacy assembled the document in `src/lib/server/db/actions/export.ts`
 * (#189). The selects move to the domain that owns each table (Q-078 A); what
 * stays here is the envelope and the two scope decisions that are easy to
 * lose: `passwordHash` never leaves, and other family members cross as names
 * only.
 *
 * `now` is a parameter (rule R5). Pure (rule R4).
 *
 * Doc: ./README.md#invariants
 */
import type {
	AccountExportDocument,
	AccountExportFamily,
	AccountExportSlices
} from './account.contract';

/** The document's version. A new shape needs a new version, not a silent edit. */
export const EXPORT_VERSION = 1 as const;

/**
 * The document's top-level keys, in the legacy order. `composeAccountExport`
 * assembles them in this order and the rules test pins the two together, so a
 * key cannot be added to one and forgotten in the other.
 */
export const ACCOUNT_EXPORT_KEYS = [
	'version',
	'generatedAt',
	'account',
	'settings',
	'subscriptions',
	'families',
	'events',
	'eventAttendance',
	'eventExceptions',
	'tasks',
	'taskTags',
	'taskCompletions',
	'bills',
	'receiptItems',
	'groceryItems',
	'notifications'
] as const;

/**
 * `attachment; filename="familyplanz-export-YYYY-MM-DD.json"`'s filename. The
 * date is the UTC day of the request (legacy `toISOString().slice(0, 10)`).
 */
export function exportFileName(now: Date): string {
	return `familyplanz-export-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * The user row minus its credential. Destructuring strips `passwordHash` in one
 * place, so a widened select cannot turn into a leaked hash.
 */
export function exportedAccountRow<T extends { readonly passwordHash?: unknown }>(
	person: T
): Omit<T, 'passwordHash'> {
	const { passwordHash: _dropped, ...account } = person;
	void _dropped;
	return account;
}

/** A person as the export names them: id and the two names, nothing else. */
export type AccountExportPersonName = {
	readonly id: string;
	readonly firstName: string | null;
	readonly lastName: string | null;
};

/** One family basics row: the family row's export columns. */
export type AccountExportFamilyRow = {
	readonly id: string;
	readonly name: string;
	readonly color: string | null;
	readonly createdAt: Date;
};

/** One membership row: the viewer's own membership of an exported family. */
export type AccountExportMembershipRow = {
	readonly userId: string;
	readonly familyId: string;
	readonly role: string | null;
	readonly memberType: string | null;
};

/** One member join row: which person belongs to which family. */
export type AccountExportFamilyMemberRow = {
	readonly userId: string;
	readonly familyId: string;
};

/** Names only, enforced at the projection too: extra columns cannot leak. */
export function exportedPersonNames(person: AccountExportPersonName): AccountExportPersonName {
	return { id: person.id, firstName: person.firstName, lastName: person.lastName };
}

/**
 * The families slice: for each of the viewer's families, its basics, the
 * viewer's membership row, and every OTHER member as a name only.
 *
 * Legacy fell back to the first membership when a family matched none; a family
 * with no membership row cannot come from the same read, so it is skipped
 * rather than exported without its context.
 */
export function exportedFamilies(
	families: readonly AccountExportFamilyRow[],
	memberships: readonly AccountExportMembershipRow[],
	familyMembers: readonly AccountExportFamilyMemberRow[],
	people: readonly AccountExportPersonName[],
	viewerId: string
): AccountExportFamily[] {
	const nameById = new Map(people.map((person) => [person.id, person]));
	const exported: AccountExportFamily[] = [];
	for (const family of families) {
		const membership = memberships.find((row) => row.familyId === family.id) ?? memberships[0];
		if (!membership) continue;
		exported.push({
			family: {
				id: family.id,
				name: family.name,
				color: family.color,
				createdAt: family.createdAt.toISOString()
			},
			membership: {
				userId: membership.userId,
				familyId: membership.familyId,
				role: membership.role,
				memberType: membership.memberType
			},
			otherMembers: familyMembers
				.filter((member) => member.familyId === family.id && member.userId !== viewerId)
				.flatMap((member) => {
					const person = nameById.get(member.userId);
					return person ? [exportedPersonNames(person)] : [];
				})
		});
	}
	return exported;
}

/**
 * The event ids the calendar slice reads: the viewer's attendance rows first
 * (legacy insertion order), then every event an exported task points at, each
 * once. Empty means owner-only, which the reader must handle because an empty
 * `IN` list is not a query.
 */
export function exportedEventIds(
	attendance: readonly { readonly eventId: string | null }[],
	tasks: readonly { readonly eventId: string | null }[]
): string[] {
	const ids = new Set<string>();
	for (const row of attendance) if (row.eventId) ids.add(row.eventId);
	for (const row of tasks) if (row.eventId) ids.add(row.eventId);
	return [...ids];
}

/**
 * The one document: version and instant first, then the slices in
 * `ACCOUNT_EXPORT_KEYS` order. Assembled literally rather than spread so the
 * key order is a property of this function, not of the caller's object.
 */
export function composeAccountExport(
	slices: AccountExportSlices,
	generatedAt: Date
): AccountExportDocument {
	return {
		version: EXPORT_VERSION,
		generatedAt: generatedAt.toISOString(),
		account: slices.account,
		settings: slices.settings,
		subscriptions: slices.subscriptions,
		families: slices.families,
		events: slices.events,
		eventAttendance: slices.eventAttendance,
		eventExceptions: slices.eventExceptions,
		tasks: slices.tasks,
		taskTags: slices.taskTags,
		taskCompletions: slices.taskCompletions,
		bills: slices.bills,
		receiptItems: slices.receiptItems,
		groceryItems: slices.groceryItems,
		notifications: slices.notifications
	};
}
