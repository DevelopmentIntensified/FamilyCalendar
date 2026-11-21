/**
 * alerts preference services against real Postgres: the four switches stored
 * in `activeSubscriptions.notificationMethods`. Expected values are the
 * approved page's copy (`accountNotifications.ts`) and the legacy
 * `notificationMethods.ts` / `accountData.ts` behaviour.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import { subscriptions } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { getAlertPreferences, setAlertPreference } from './alerts.preferences.service.server';
import { DEFAULT_ALERT_PREFERENCES } from './alerts.preferences.rules';
import { seedAlertPreferencesRow } from './alerts.fixtures.server';

const NOW = '2026-03-01T09:00:00.000Z';

/** A db whose `select` fails, for the read-failure path (`loadNotificationPreferences`). */
function unreadableDb(db: Db): Db {
	return new Proxy(db, {
		get(target, property, receiver) {
			if (property === 'select') {
				return () => {
					throw new Error('read failed');
				};
			}
			return Reflect.get(target, property, receiver);
		}
	});
}

describe('getAlertPreferences', () => {
	rollbackTest('answers the approved defaults with no row, and writes nothing', async (db) => {
		const user = await seedUser(db);

		const preferences = await getAlertPreferences(
			testCtx({ db, now: NOW }),
			actorFromUser(user, 'session')
		);

		expect(preferences).toEqual({
			taskAssigned: true,
			taskCompleted: true,
			familyJoined: false,
			aiSuggestions: true
		});
		expect(preferences).toEqual(DEFAULT_ALERT_PREFERENCES);
		expect(await db.select().from(subscriptions)).toEqual([]);
	});

	rollbackTest('reads the stored switches of the newest unexpired row', async (db) => {
		const user = await seedUser(db);
		await seedAlertPreferencesRow(
			user.id,
			{
				email: true,
				sms: true,
				preferences: {
					taskAssigned: false,
					taskCompleted: false,
					familyJoined: true,
					aiSuggestions: false
				}
			},
			{ createdAt: new Date('2026-01-01T00:00:00.000Z') },
			db
		);
		await seedAlertPreferencesRow(
			user.id,
			{
				email: false,
				sms: false,
				preferences: {
					taskAssigned: false,
					taskCompleted: true,
					familyJoined: false,
					aiSuggestions: false
				}
			},
			{ createdAt: new Date('2026-02-01T00:00:00.000Z') },
			db
		);

		const preferences = await getAlertPreferences(
			testCtx({ db, now: NOW }),
			actorFromUser(user, 'session')
		);

		expect(preferences).toEqual({
			taskAssigned: false,
			taskCompleted: true,
			familyJoined: false,
			aiSuggestions: false
		});
	});

	rollbackTest('ignores an expired row and falls back to the defaults', async (db) => {
		const user = await seedUser(db);
		await seedAlertPreferencesRow(
			user.id,
			{
				email: true,
				sms: true,
				preferences: {
					taskAssigned: false,
					taskCompleted: false,
					familyJoined: true,
					aiSuggestions: false
				}
			},
			{ endDate: new Date('2020-01-01T00:00:00.000Z') },
			db
		);

		const preferences = await getAlertPreferences(
			testCtx({ db, now: NOW }),
			actorFromUser(user, 'session')
		);

		expect(preferences).toEqual(DEFAULT_ALERT_PREFERENCES);
	});

	rollbackTest('answers the defaults and logs when the read fails', async (db) => {
		const user = await seedUser(db);
		const ctx = testCtx({ db: unreadableDb(db), now: NOW });

		const preferences = await getAlertPreferences(ctx, actorFromUser(user, 'session'));

		expect(preferences).toEqual(DEFAULT_ALERT_PREFERENCES);
		expect(ctx.log.entries).toContainEqual(
			expect.objectContaining({ level: 'error', event: 'alert_preferences_read_failed' })
		);
	});
});

describe('setAlertPreference', () => {
	rollbackTest('saves one switch and answers the receipt', async (db) => {
		const user = await seedUser(db);
		const ctx = testCtx({ db, now: NOW });

		const saved = await setAlertPreference(ctx, actorFromUser(user, 'session'), {
			id: 'taskAssigned',
			value: false
		});

		expect(saved).toEqual({ ok: true, message: 'Task assigned to me alerts are off. Saved.' });
		expect(await getAlertPreferences(ctx, actorFromUser(user, 'session'))).toEqual({
			taskAssigned: false,
			taskCompleted: true,
			familyJoined: false,
			aiSuggestions: true
		});
	});

	rollbackTest('keeps the legacy {email,sms} half of the row untouched', async (db) => {
		const user = await seedUser(db);
		await seedAlertPreferencesRow(user.id, { email: true, sms: true }, {}, db);

		const saved = await setAlertPreference(
			testCtx({ db, now: NOW }),
			actorFromUser(user, 'session'),
			{ id: 'taskCompleted', value: false }
		);

		expect(saved).toEqual({ ok: true, message: 'Task completed alerts are off. Saved.' });
		const [row] = await db.select().from(subscriptions);
		expect(row.notificationMethods).toEqual({
			email: true,
			sms: true,
			preferences: {
				taskAssigned: true,
				taskCompleted: false,
				familyJoined: false,
				aiSuggestions: true
			}
		});
	});

	rollbackTest('creates a tierless row on the first toggle', async (db) => {
		const user = await seedUser(db);

		const saved = await setAlertPreference(
			testCtx({ db, now: NOW }),
			actorFromUser(user, 'session'),
			{ id: 'familyJoined', value: true }
		);

		expect(saved).toEqual({
			ok: true,
			message: 'Someone joined the family alerts are on. Saved.'
		});
		const rows = await db.select().from(subscriptions);
		expect(rows).toHaveLength(1);
		expect(rows[0].subscriptionTypeId).toBeNull();
		expect(rows[0].endDate.toISOString()).toBe('9999-12-31T00:00:00.000Z');
		expect(rows[0].notificationMethods).toEqual({
			email: false,
			sms: false,
			preferences: {
				taskAssigned: true,
				taskCompleted: true,
				familyJoined: true,
				aiSuggestions: true
			}
		});
	});

	rollbackTest('reports a write failure with the did-not-save copy', async (db) => {
		const ctx = testCtx({ db, now: NOW });

		// An account row that does not exist breaks the insert's foreign key: the
		// card must get the copy that reverts the switch, not a thrown error.
		const saved = await setAlertPreference(
			ctx,
			actorFromUser({ id: 'no-such-account', email: null, roles: [] }, 'session'),
			{ id: 'taskAssigned', value: true }
		);

		expect(saved).toEqual({
			ok: false,
			message: 'Task assigned to me alerts are on. This did not save.'
		});
		expect(ctx.log.entries).toContainEqual(
			expect.objectContaining({ level: 'error', event: 'alert_preference_save_failed' })
		);
	});
});
