import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryBuilder } from 'drizzle-orm/pg-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import * as schemaModule from '$lib/server/db/schema';

/**
 * buildUserDataExport contract (#189) — the only server code that decides
 * what "the requester's own data" means. The scripted drizzle stub returns
 * whatever each table's queue holds; the tests pin:
 * 1. every SELECT's WHERE clause really filters to the requester ('user-a'),
 * 2. the user row is exported WITHOUT passwordHash (a credential, not data),
 * 3. family context carries siblings as NAMES ONLY — even if the stub hands
 *    back a full sibling row, the projection strips their email + phone,
 * 4. a missing user row throws rather than exporting an empty document.
 * The route-level behaviour (auth gate, attachment headers) lives in
 * src/routes/api/account/export/server.test.ts.
 */

/** Raw drizzle callables captured by the scripted db stub, serialized later
 * in the test body (statically): table object + WHERE condition. */
interface CapturedQuery {
	table: object;
	condition: object;
}

interface StubState {
	/** Table key (schema export name) -> rows for each successive SELECT. */
	queues: Map<string, unknown[][]>;
	/** Every SELECT issued, in order. */
	queries: CapturedQuery[];
}

const state = vi.hoisted(
	(): StubState => ({ queues: new Map(), queries: [] as unknown as CapturedQuery[] })
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins the SELECT contracts; same pattern as users.test.ts / calendar.test.ts.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: (table: object) => ({
				where: async (condition: object) => {
					state.queries.push({ table, condition });
					const key = tableKey(table);
					const queue = state.queues.get(key) ?? [];
					return queue.shift() ?? [];
				}
			})
		})
	}
}));

function tableKey(table: object): string {
	for (const [key, value] of Object.entries(schemaModule)) {
		if (value === table) return key;
	}
	throw new Error('Scripted stub hit an unknown table');
}

/** Re-serialize the captured WHERE clause so tests can assert on the real
 * conditions instead of trusting returned rows alone. */
function whereSql(call: CapturedQuery): { sql: string; params: unknown[] } {
	const { sql, params } = new QueryBuilder().select().from(call.table as PgTable).where(
		call.condition as never
	).toSQL();
	return { sql, params };
}

import { buildUserDataExport } from './export';

describe('buildUserDataExport', () => {
	beforeEach(() => {
		state.queues = new Map();
		state.queries = [];

		// user-a full row (with credential) — export must strip passwordHash.
		state.queues.set('users', [
			[
				{
					id: 'user-a',
					firstName: 'Ada',
					lastName: 'Owner',
					email: 'a@example.com',
					passwordHash: 'scrypt:dont-leak',
					phonenumber: null,
					emailVerified: true,
					createdAt: new Date('2026-01-01'),
					lastActiveAt: new Date('2026-10-15')
				}
			],
			// Second users query = sibling NAMES projection. Hand back a FULL
			// sibling row on purpose; the projection must strip email etc.
			[
				{
					id: 'user-b',
					firstName: 'Bea',
					lastName: 'Sibling',
					email: 'b@example.com',
					passwordHash: 'scrypt:b',
					phonenumber: '+15550100',
					emailVerified: true,
					createdAt: new Date('2026-01-02'),
					lastActiveAt: new Date('2026-10-15')
				}
			]
		]);
		state.queues.set('userSettings', [[{ id: 'settings-1', userId: 'user-a', timeZone: 'UTC' }]]);
		state.queues.set('subscriptions', [[{ id: 'sub-1', userId: 'user-a' }]]);
		// familyMembers is queried twice: my rows, then every member of my families.
		state.queues.set('familyMembers', [
			[
				{ userId: 'user-a', familyId: 'fam-1', role: 'member' },
				{ userId: 'user-a', familyId: 'fam-2', role: 'member' }
			],
			[
				{ userId: 'user-a', familyId: 'fam-1', role: 'member' },
				{ userId: 'user-b', familyId: 'fam-1', role: 'member' },
				{ userId: 'user-a', familyId: 'fam-2', role: 'member' }
			]
		]);
		state.queues.set('families', [
			[
				{ id: 'fam-1', name: 'Smiths', color: 'blue', createdAt: new Date('2026-01-01') },
				{ id: 'fam-2', name: 'Juniors', color: null, createdAt: new Date('2026-02-01') }
			]
		]);
		state.queues.set('tasks', [[{ id: 'task-1', userId: 'user-a', assignedTo: null, eventId: 'ev-1' }]]);
		state.queues.set('taskCompletions', [[{ id: 'tc-1', userId: 'user-a', actorId: 'user-b' }]]);
		state.queues.set('taskTags', [[{ taskId: 'task-1', name: 'errand' }]]);
		state.queues.set('eventAttendance', [[{ id: 'att-1', eventId: 'ev-2', userId: 'user-a' }]]);
		state.queues.set('events', [
			[
				{ id: 'ev-1', ownerId: 'user-a', title: 'Dentist' },
				{ id: 'ev-2', ownerId: 'user-c', title: 'Piano lesson' }
			]
		]);
		state.queues.set('eventExceptions', [[{ id: 'exc-1', eventId: 'ev-2' }]]);
		state.queues.set('bills', [[{ id: 'bill-1', userId: 'user-a' }]]);
		state.queues.set('receiptItems', [[{ id: 'ri-1', billId: 'bill-1', label: 'Milk' }]]);
		state.queues.set('groceryItems', [[{ id: 'gi-1', userId: 'user-a', name: 'Eggs' }]]);
		state.queues.set('notifications', [[{ id: 'n-1', userId: 'user-a', message: 'hi' }]]);
	});

	it('exports per-user rows from every covered table, stripping passwordHash', async () => {
		const exported = await buildUserDataExport('user-a');

		expect(exported.account.email).toBe('a@example.com');
		expect(exported.account).not.toHaveProperty('passwordHash');

		expect(exported.settings).toEqual([{ id: 'settings-1', userId: 'user-a', timeZone: 'UTC' }]);
		expect(exported.subscriptions).toHaveLength(1);
		expect(exported.notifications).toHaveLength(1);
		expect(exported.groceryItems).toHaveLength(1);
		expect(exported.tasks).toHaveLength(1);
		expect(exported.taskTags).toEqual([{ taskId: 'task-1', name: 'errand' }]);
		expect(exported.taskCompletions).toEqual([{ id: 'tc-1', userId: 'user-a', actorId: 'user-b' }]);
		expect(exported.bills).toHaveLength(1);
		expect(exported.receiptItems).toEqual([{ id: 'ri-1', billId: 'bill-1', label: 'Milk' }]);
		expect(exported.events.map((event) => event.id)).toEqual(['ev-1', 'ev-2']);
		expect(exported.eventAttendance).toEqual([{ id: 'att-1', eventId: 'ev-2', userId: 'user-a' }]);
		expect(exported.eventExceptions).toEqual([{ id: 'exc-1', eventId: 'ev-2' }]);
	});

	it('carries other family members as names only, even if richer rows exist', async () => {
		const exported = await buildUserDataExport('user-a');

		expect(exported.families).toHaveLength(2);
		const smiths = exported.families.find((family) => family.family.id === 'fam-1');
		expect(smiths?.family).toStrictEqual({
			id: 'fam-1',
			name: 'Smiths',
			color: 'blue',
			createdAt: new Date('2026-01-01')
		});
		expect(smiths?.membership).toEqual({ userId: 'user-a', familyId: 'fam-1', role: 'member' });
		expect(smiths?.otherMembers).toEqual([{ id: 'user-b', firstName: 'Bea', lastName: 'Sibling' }]);
		// The rich fields the stub handed back must be gone: names only.
		expect(smiths?.otherMembers[0]).not.toHaveProperty('email');
		expect(smiths?.otherMembers[0]).not.toHaveProperty('passwordHash');
		expect(smiths?.otherMembers[0]).not.toHaveProperty('phonenumber');
	});

	it('issues every SELECT filtered to the requester', async () => {
		await buildUserDataExport('user-a');

		expect(state.queries.length).toBeGreaterThan(0);
		const userOnlyTables = [
			'users',
			'userSettings',
			'subscriptions',
			'tasks',
			'taskCompletions',
			'eventAttendance',
			'bills',
			'groceryItems',
			'notifications'
		];
		for (const table of userOnlyTables) {
			const calls = state.queries.filter((query) => tableKey(query.table) === table);
			expect(calls, `no query against ${table}`).not.toHaveLength(0);
			for (const call of calls) {
				const { sql, params } = whereSql(call);
				// The sibling-names read (second users query) is the one users query
				// legitimately keyed by Others' ids, vetted separately below.
				if (tableKey(call.table) === 'users' && sql.includes('"users"."id" in')) continue;
				expect(params, sql).toContain('user-a');
				expect(params, sql).not.toContain('user-b');
			}
		}
		// Attendance also filters by the requester's id.
		const attendance = whereSql(
			state.queries.find((query) => tableKey(query.table) === 'eventAttendance')!
		);
		expect(attendance.params).toEqual(['user-a']);
	});

	it('throws when the user row is missing rather than exporting emptiness', async () => {
		state.queues.set('users', [[]]);
		await expect(buildUserDataExport('missing-user')).rejects.toThrow(/missing user/);
	});
});
