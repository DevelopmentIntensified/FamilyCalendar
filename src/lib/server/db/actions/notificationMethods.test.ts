import { describe, it, expect, vi, beforeEach } from 'vitest';
// Type-only: the value import of the table below is hoisted past the mock
// factory, so the factory's own reference to it stays an inline type instead.
import type { subscriptions as SubscriptionsTable } from '$lib/server/db/schema';
import type { StoredNotificationMethods } from '$lib/components/account/accountNotifications';
import type { SQL } from 'drizzle-orm';

/**
 * The read and the write for the account page's Notifications card.
 *
 * The column is `activeSubscriptions.notificationMethods`, a `jsonb` that already
 * carries the billing half `{ email, sms }`. The scripted drizzle stub pins the
 * two things that matter and cannot be seen in a diff: which row is written, and
 * what the written JSON contains — a legacy row must come out of a save with its
 * billing half intact.
 *
 * Scripted stub, same pattern as users.test.ts / calendar.test.ts.
 */

/** A row as the stub returns it: the column is `jsonb`, so a hand-edited row may
 *  hold a shape the card must survive. */
type SelectRow = {
	id: string;
	notificationMethods?: StoredNotificationMethods | { email?: unknown; sms?: unknown };
};

/** One `.update().set()` call, with the table it targeted. */
interface RecordedUpdate {
	table: typeof SubscriptionsTable;
	patch: { notificationMethods: StoredNotificationMethods };
}

/** The `.values()` payload of one `.insert()` call. */
interface RecordedInsert {
	userId: string;
	notificationMethods: StoredNotificationMethods;
	subscriptionTypeId: null;
	endDate: Date;
}

interface StubState {
	selectRows: SelectRow[];
	updates: RecordedUpdate[];
	inserts: RecordedInsert[];
}

/** The slice of the drizzle client the read and the write use. */
interface DbStub {
	select(): {
		from(_table: typeof SubscriptionsTable): {
			where(
				_cond: SQL<unknown>
			): { orderBy(_order: SQL<unknown>): { limit(_n: number): Promise<SelectRow[]> } };
		};
	};
	update(_table: typeof SubscriptionsTable): {
		set(_patch: { notificationMethods: StoredNotificationMethods }): { where(): Promise<void> };
	};
	insert(_table: typeof SubscriptionsTable): { values(_row: RecordedInsert): Promise<void> };
}

const state = vi.hoisted(
	(): StubState => ({
		selectRows: [],
		updates: [],
		inserts: []
	})
);

beforeEach(() => {
	state.selectRows = [];
	state.updates = [];
	state.inserts = [];
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins the row written and the JSON it carries; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => ({
					orderBy: () => ({
						limit: async () => state.selectRows
					})
				})
			})
		}),
		update: (table: typeof import('$lib/server/db/schema').subscriptions) => ({
			set: (patch: { notificationMethods: StoredNotificationMethods }) => ({
				where: async () => {
					state.updates.push({ table, patch });
				}
			})
		}),
		insert: (_table: typeof import('$lib/server/db/schema').subscriptions) => ({
			values: async (row: RecordedInsert) => {
				state.inserts.push(row);
			}
		})
	} satisfies DbStub
}));

import { subscriptions } from '$lib/server/db/schema';
import {
	getNotificationPreferences,
	setNotificationPreference
} from './notificationMethods';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '$lib/components/account/accountNotifications';

/** The shape of the one row the live database carries today. */
const LEGACY_ROW: SelectRow = { id: 'sub-1', notificationMethods: { email: true, sms: false } };

/** The storage half of the column, as the schema types it. */
type StoredColumn = NonNullable<(typeof subscriptions.$inferSelect)['notificationMethods']>;

describe('the column type still accepts what the card writes', () => {
	it('accepts a legacy billing row and a row carrying preferences', () => {
		// Compile-time guard: the four keys the card persists and the two the
		// billing half needs are both in the column's type. If either drifts,
		// this stops typechecking (caught by svelte-check).
		const legacy: StoredColumn = { email: true, sms: false };
		const withPreferences: StoredColumn = {
			...legacy,
			preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES }
		};
		expect(legacy.preferences).toBeUndefined();
		// SAFETY: the literal above sets every key the type requires, so the
		// optional `preferences` is present on this second literal.
		const bag = withPreferences.preferences as NonNullable<StoredColumn['preferences']>;
		expect(Object.keys(bag)).toHaveLength(4);
	});
});

describe('getNotificationPreferences — the read never writes', () => {
	it('reads a legacy billing row as the approved defaults', async () => {
		state.selectRows = [LEGACY_ROW];
		expect(await getNotificationPreferences('user-1')).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
	});

	it('reads a saved bag back', async () => {
		state.selectRows = [
			{
				id: 'sub-1',
				notificationMethods: {
					email: false,
					sms: false,
					preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, familyJoined: true }
				}
			}
		];
		expect((await getNotificationPreferences('user-1')).familyJoined).toBe(true);
	});

	it('shows the approved defaults to an account with no subscription row, and writes nothing', async () => {
		// "Persist on first toggle" means a page view must not create a row.
		state.selectRows = [];
		expect(await getNotificationPreferences('user-1')).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
		expect(state.updates).toEqual([]);
		expect(state.inserts).toEqual([]);
	});
});

describe('setNotificationPreference — the round trip', () => {
	it('keeps the legacy billing half byte-identical and adds the preferences bag', async () => {
		// This is the row on the live database. After a save it must still answer
		// `{ email, sms }` to anything that reads the billing shape.
		state.selectRows = [LEGACY_ROW];

		await setNotificationPreference('user-1', 'familyJoined', true);

		expect(state.updates).toHaveLength(1);
		expect(state.updates[0].table).toBe(subscriptions);
		expect(state.updates[0].patch.notificationMethods).toEqual({
			email: true,
			sms: false,
			preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, familyJoined: true }
		});
	});

	it('a second save still sees the original billing values', async () => {
		state.selectRows = [LEGACY_ROW];
		await setNotificationPreference('user-1', 'aiSuggestions', false);
		// What the row would read back as on the next load.
		const written = state.updates[0].patch.notificationMethods;
		expect(written.email).toBe(true);
		expect(written.sms).toBe(false);
		expect(written.preferences?.aiSuggestions).toBe(false);
		expect(written.preferences?.taskAssigned).toBe(true);
	});

	it('writes only the key it was asked about', async () => {
		state.selectRows = [
			{
				id: 'sub-1',
				notificationMethods: {
					email: true,
					sms: false,
					preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, familyJoined: true }
				}
			}
		];

		await setNotificationPreference('user-1', 'taskCompleted', false);

		expect(state.updates[0].patch.notificationMethods).toEqual({
			email: true,
			sms: false,
			preferences: { taskAssigned: true, taskCompleted: false, familyJoined: true, aiSuggestions: true }
		});
	});

	it('creates a tierless row when the account has none, claiming no channel consent', async () => {
		// Nothing else in the app writes this table, so most accounts have no row
		// at all. Without this the switch would render and never persist.
		state.selectRows = [];

		await setNotificationPreference('user-1', 'aiSuggestions', false);

		expect(state.updates).toEqual([]);
		expect(state.inserts).toHaveLength(1);
		const row = state.inserts[0];
		expect(row.userId).toBe('user-1');
		expect(row.notificationMethods).toEqual({
			email: false,
			sms: false,
			preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, aiSuggestions: false }
		});
		// A null tier keeps this row out of every plan read: `getActiveSubscriptionRow`
		// filters on `subscriptionTypeId IS NOT NULL`, so it cannot be mistaken for
		// a subscription the account never bought.
		expect(row.subscriptionTypeId).toBeNull();
		expect(row.endDate.getTime()).toBeGreaterThan(Date.now());
	});
});