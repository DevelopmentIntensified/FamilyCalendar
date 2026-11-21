/**
 * The export document's pure rules: filename, key order, the two scope
 * decisions (hash stripped, other members as names only) and the event-id
 * union. Expected values are the legacy assembly and the golden
 * (`account.http.db.test.ts › GET /api/account/export`), never this code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { AccountExportSlices } from './account.contract';
import {
	ACCOUNT_EXPORT_KEYS,
	EXPORT_VERSION,
	composeAccountExport,
	exportFileName,
	exportedAccountRow,
	exportedEventIds,
	exportedFamilies,
	exportedPersonNames
} from './account.export.rules';

describe('exportFileName', () => {
	it.each<[string, Date, string]>([
		['a plain day', new Date('2026-11-19T12:00:00.000Z'), 'familyplanz-export-2026-11-19.json'],
		['month and day padding', new Date('2026-01-05T00:00:00.000Z'), 'familyplanz-export-2026-01-05.json'],
		[
			'the UTC day, not local wall time',
			new Date('2026-03-01T23:59:59.999Z'),
			'familyplanz-export-2026-03-01.json'
		]
	])('names the %s', (_label, now, expected) => {
		expect(exportFileName(now)).toBe(expected);
	});
});

describe('ACCOUNT_EXPORT_KEYS', () => {
	// Legacy, export.ts:187-206 › the returned object literal's key order.
	it('keeps the legacy document order', () => {
		expect(ACCOUNT_EXPORT_KEYS).toEqual([
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
		]);
	});
});

function slices(overrides: Partial<AccountExportSlices> = {}): AccountExportSlices {
	return {
		account: { id: 'user-1', firstName: 'Ada' },
		settings: [],
		subscriptions: [],
		families: [],
		events: [],
		eventAttendance: [],
		eventExceptions: [],
		tasks: [],
		taskTags: [],
		taskCompletions: [],
		bills: [],
		receiptItems: [],
		groceryItems: [],
		notifications: [],
		...overrides
	};
}

describe('composeAccountExport', () => {
	it('adds the version and the ISO instant and nothing else', () => {
		const document = composeAccountExport(slices(), new Date('2026-11-19T10:00:00.000Z'));

		expect(document).toEqual({
			version: 1,
			generatedAt: '2026-11-19T10:00:00.000Z',
			account: { id: 'user-1', firstName: 'Ada' },
			settings: [],
			subscriptions: [],
			families: [],
			events: [],
			eventAttendance: [],
			eventExceptions: [],
			tasks: [],
			taskTags: [],
			taskCompletions: [],
			bills: [],
			receiptItems: [],
			groceryItems: [],
			notifications: []
		});
		expect(EXPORT_VERSION).toBe(1);
	});

	it('writes the keys in ACCOUNT_EXPORT_KEYS order', () => {
		const document = composeAccountExport(slices(), new Date('2026-11-19T10:00:00.000Z'));
		expect(Object.keys(document)).toEqual([...ACCOUNT_EXPORT_KEYS]);
	});

	it('carries every slice through untouched', () => {
		const settings = [{ userId: 'user-1', timeZone: 'Europe/Madrid' }];
		const tasks = [{ id: 'task-1', title: 'Mine' }];
		const document = composeAccountExport(
			slices({ settings, tasks }),
			new Date('2026-11-19T10:00:00.000Z')
		);
		expect(document.settings).toBe(settings);
		expect(document.tasks).toBe(tasks);
	});
});

describe('exportedAccountRow', () => {
	it('strips passwordHash and keeps every other column', () => {
		const user = { id: 'user-1', email: 'ada@example.test', passwordHash: 'hash' };
		expect(exportedAccountRow(user)).toEqual({ id: 'user-1', email: 'ada@example.test' });
	});

	it('does not mutate the row it was handed', () => {
		const user = { id: 'user-1', passwordHash: 'hash' };
		exportedAccountRow(user);
		expect(user.passwordHash).toBe('hash');
	});

	it('leaves a row that never had a hash alone', () => {
		expect(exportedAccountRow({ id: 'user-1' })).toEqual({ id: 'user-1' });
	});
});

describe('exportedPersonNames', () => {
	it('keeps exactly id, firstName and lastName', () => {
		// A wider row (a select that forgot to project) must not leak. Held in a
		// variable so the extra column is a structural superset, not an object
		// literal the compiler already refuses.
		const widerRow = {
			id: 'user-2',
			firstName: 'Bob',
			lastName: 'Lovelace',
			email: 'bob@example.test'
		};
		expect(exportedPersonNames(widerRow)).toEqual({
			id: 'user-2',
			firstName: 'Bob',
			lastName: 'Lovelace'
		});
	});
});

describe('exportedFamilies', () => {
	const FAMILY_CREATED_AT = new Date('2026-01-02T03:04:05.000Z');

	it('carries the family, my membership and every other member as a name only', () => {
		// Golden: account.http.db.test.ts › GET /api/account/export ›
		// downloads the requester document and no other member private rows.
		const bob = {
			id: 'user-2',
			firstName: 'Bob',
			lastName: 'Lovelace',
			email: 'bob@example.test'
		};
		const exported = exportedFamilies(
			[{ id: 'family-1', name: 'Lovelace', color: null, createdAt: FAMILY_CREATED_AT }],
			[{ userId: 'user-1', familyId: 'family-1', role: 'owner', memberType: 'parent' }],
			[
				{ userId: 'user-1', familyId: 'family-1' },
				{ userId: 'user-2', familyId: 'family-1' }
			],
			[
				{ id: 'user-1', firstName: 'Ada', lastName: 'Lovelace' },
				bob
			],
			'user-1'
		);

		expect(exported).toEqual([
			{
				family: {
					id: 'family-1',
					name: 'Lovelace',
					color: null,
					createdAt: '2026-01-02T03:04:05.000Z'
				},
				membership: {
					userId: 'user-1',
					familyId: 'family-1',
					role: 'owner',
					memberType: 'parent'
				},
				otherMembers: [{ id: 'user-2', firstName: 'Bob', lastName: 'Lovelace' }]
			}
		]);
	});

	it('lists every family with its own name and my membership', () => {
		// Legacy, accountCalendars.test.ts › "lists the calendar of EVERY family,
		// named after its own family" — the export has the same rule (#251).
		const exported = exportedFamilies(
			[
				{ id: 'family-1', name: 'Lovelace', color: '#111111', createdAt: FAMILY_CREATED_AT },
				{ id: 'family-2', name: 'Hopper', color: null, createdAt: FAMILY_CREATED_AT }
			],
			[
				{ userId: 'user-1', familyId: 'family-1', role: 'owner', memberType: 'parent' },
				{ userId: 'user-1', familyId: 'family-2', role: 'member', memberType: 'member' }
			],
			[],
			[{ id: 'user-1', firstName: 'Ada', lastName: null }],
			'user-1'
		);

		expect(exported.map((entry) => [entry.family.name, entry.membership.role])).toEqual([
			['Lovelace', 'owner'],
			['Hopper', 'member']
		]);
	});

	it('drops a member whose person row is no longer there', () => {
		const exported = exportedFamilies(
			[{ id: 'family-1', name: 'Lovelace', color: null, createdAt: FAMILY_CREATED_AT }],
			[{ userId: 'user-1', familyId: 'family-1', role: 'owner', memberType: 'parent' }],
			[
				{ userId: 'user-1', familyId: 'family-1' },
				{ userId: 'gone', familyId: 'family-1' }
			],
			[{ id: 'user-1', firstName: 'Ada', lastName: 'Lovelace' }],
			'user-1'
		);

		expect(exported[0].otherMembers).toEqual([]);
	});

	it('answers no families for a viewer with no memberships', () => {
		expect(
			exportedFamilies(
				[{ id: 'family-1', name: 'Lovelace', color: null, createdAt: FAMILY_CREATED_AT }],
				[],
				[],
				[],
				'user-1'
			)
		).toEqual([]);
	});
});

describe('exportedEventIds', () => {
	// Legacy, export.ts:96-104: attendance first, then the exported tasks.
	it('unions my attendance events with the exported tasks’ events, each once', () => {
		expect(
			exportedEventIds(
				[{ eventId: 'event-a' }, { eventId: 'event-b' }, { eventId: null }],
				[
					{ eventId: 'event-b' },
					{ eventId: 'event-c' },
					{ eventId: null }
				]
			)
		).toEqual(['event-a', 'event-b', 'event-c']);
	});

	it('answers an empty list when there is nothing to read', () => {
		expect(exportedEventIds([], [])).toEqual([]);
	});
});
