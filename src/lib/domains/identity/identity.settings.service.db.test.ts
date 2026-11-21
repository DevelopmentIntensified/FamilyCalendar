/**
 * identity settings service against real Postgres, with in-memory fakes for
 * the two cross-module ports (the S5 rule: goldens get the real adapters,
 * service tests get fakes they can inspect). Covers the merged view, the
 * create-or-update save, the default-calendar check and its skip, and the
 * #088 consent rules including both degraded paths.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import { userSettings } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx, type TestCtx } from '$lib/kernel/testing/testCtx.server';
import type { ConsentRecordView } from './identity.contract';
import {
	seedIdentityCalendar,
	seedIdentitySettings,
	seedIdentitySparseSettings
} from './identity.fixtures.server';
import {
	getCalendarSettings,
	getStoredCalendarSettings,
	setHiddenDashboardModules,
	updateCalendarSettings
} from './identity.settings.service.server';
import type { AdConsentPort, CalendarAccessPort, IdentityCtx } from './index.server';

const NOW = new Date('2026-04-01T12:00:00.000Z');

type ConsentChange = {
	readonly userId: string;
	readonly previous: boolean | null | undefined;
	readonly next: boolean;
};

function memoryCalendar(ids: readonly string[]): CalendarAccessPort & {
	readonly calls: string[];
} {
	const calls: string[] = [];
	return {
		calls,
		listAccessibleCalendarIds: async (userId) => {
			calls.push(userId);
			return ids;
		}
	};
}

function memoryConsent(options: {
	readonly history?: readonly ConsentRecordView[];
	readonly failHistory?: boolean;
	readonly failRecord?: boolean;
} = {}): AdConsentPort & { readonly changes: ConsentChange[] } {
	const changes: ConsentChange[] = [];
	return {
		changes,
		listConsentHistory: async () => {
			if (options.failHistory) throw new Error('trail down');
			return options.history ?? [];
		},
		recordConsentChange: async (userId, previous, next) => {
			if (options.failRecord) throw new Error('consent down');
			changes.push({ userId, previous, next });
		}
	};
}

function ctxFor(
	db: Db,
	calendarAccess: CalendarAccessPort,
	adConsent: AdConsentPort
): IdentityCtx & TestCtx {
	return { ...testCtx({ db, now: NOW.toISOString() }), calendarAccess, adConsent };
}

describe('reading', () => {
	rollbackTest('answers the page defaults and an empty trail when no row exists', async (db) => {
		const user = await seedUser(db);
		const ctx = ctxFor(db, memoryCalendar([]), memoryConsent());
		const result = await getCalendarSettings(ctx, actorFromUser(user, 'session'));

		expect(result).toEqual({
			settings: {
				weekStart: 'sunday',
				timeZone: 'UTC',
				color: '#3b82f6',
				defaultView: 'dayView',
				defaultCalendarId: null,
				syncEventsToFamilyCalendar: false,
				showAdsAsEvents: false
			},
			consentHistory: []
		});
	});

	rollbackTest('answers the stored row without verseTranslation and the trail as given', async (db) => {
		const user = await seedUser(db);
		await seedIdentitySettings(user.id, {}, db);
		const trail: readonly ConsentRecordView[] = [
			{ decision: 'withdrawn', recordedAt: new Date('2026-10-03T18:30:00.000Z') },
			{ decision: 'granted', recordedAt: new Date('2026-10-01T10:00:00.000Z') }
		];
		const ctx = ctxFor(db, memoryCalendar([]), memoryConsent({ history: trail }));
		const result = await getCalendarSettings(ctx, actorFromUser(user, 'session'));

		expect(result.consentHistory).toEqual(trail);
		expect('verseTranslation' in result.settings).toBe(false);
		expect(result.settings).toMatchObject({
			id: 'settings-a',
			userId: user.id,
			timeZone: 'America/Chicago',
			hiddenDashboardModules: ['board'],
			updatedAt: new Date('2026-10-07T13:00:00.000Z')
		});
	});

	rollbackTest('answers an empty trail and logs when the consent read throws', async (db) => {
		const user = await seedUser(db);
		const ctx = ctxFor(db, memoryCalendar([]), memoryConsent({ failHistory: true }));
		const result = await getCalendarSettings(ctx, actorFromUser(user, 'session'));

		expect(result.consentHistory).toEqual([]);
		expect(ctx.log.entries).toEqual([
			{
				level: 'error',
				event: 'identity_consent_history_failed',
				fields: { userId: user.id, message: 'trail down' }
			}
		]);
	});
});

describe('saving', () => {
	rollbackTest('writes only the field the patch sent and answers the whole view', async (db) => {
		const user = await seedUser(db);
		await seedIdentitySettings(user.id, {}, db);
		const ctx = ctxFor(db, memoryCalendar([]), memoryConsent());

		const result = await updateCalendarSettings(ctx, actorFromUser(user, 'session'), {
			color: '#00ff00'
		});

		expect(result.settings).toMatchObject({
			id: 'settings-a',
			weekStart: 'monday',
			timeZone: 'America/Chicago',
			color: '#00ff00',
			defaultView: 'dashboard',
			syncEventsToFamilyCalendar: true,
			showDailyVerse: true
		});
		const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(row.color).toBe('#00ff00');
		expect(row.updatedAt).toEqual(NOW);
	});

	rollbackTest('leaves a sparse sign-up row’s nulls null (Q-108 B)', async (db) => {
		const user = await seedUser(db);
		await seedIdentitySparseSettings(user.id, {}, db);
		const ctx = ctxFor(db, memoryCalendar([]), memoryConsent());

		const result = await updateCalendarSettings(ctx, actorFromUser(user, 'session'), {
			timeZone: 'America/Denver'
		});

		// The view answers the defaults for the null columns ...
		expect(result.settings).toMatchObject({
			timeZone: 'America/Denver',
			color: '#3b82f6',
			syncEventsToFamilyCalendar: false
		});
		// ... but the row only holds what the patch sent.
		const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect([row.color, row.syncEventsToFamilyCalendar]).toEqual([null, null]);
		expect(row.timeZone).toBe('America/Denver');
	});

	rollbackTest('creates the row from the page defaults plus the patch when none exists', async (db) => {
		const user = await seedUser(db);
		const ctx = ctxFor(db, memoryCalendar([]), memoryConsent());

		await updateCalendarSettings(ctx, actorFromUser(user, 'session'), {
			defaultView: 'monthView'
		});

		const rows = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			weekStart: 'sunday',
			timeZone: 'UTC',
			color: '#3b82f6',
			defaultView: 'monthView',
			defaultCalendarId: null,
			syncEventsToFamilyCalendar: false,
			autoParseEventDetails: true,
			showDailyVerse: false,
			showAdsAsEvents: false
		});
		expect(rows[0].updatedAt).toEqual(NOW);
	});

	rollbackTest('rejects an inaccessible default calendar and keeps the stored row', async (db) => {
		const user = await seedUser(db);
		await seedIdentitySettings(user.id, { defaultCalendarId: null }, db);
		const calendar = memoryCalendar(['cal-mine']);
		const ctx = ctxFor(db, calendar, memoryConsent());

		await expect(
			updateCalendarSettings(ctx, actorFromUser(user, 'session'), {
				defaultCalendarId: 'cal-theirs'
			})
		).rejects.toMatchObject({
			code: 'invalid',
			status: 400,
			message: 'Selected default calendar is not available'
		});
		const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(row.defaultCalendarId).toBeNull();
	});

	rollbackTest('accepts a default calendar the port lists', async (db) => {
		const user = await seedUser(db);
		// `defaultCalendarId` is a real FK: a calendar the port lists must also exist.
		await seedIdentityCalendar(user.id, 'cal-mine', {}, db);
		await seedIdentitySettings(user.id, {}, db);
		const ctx = ctxFor(db, memoryCalendar(['cal-mine']), memoryConsent());

		const result = await updateCalendarSettings(ctx, actorFromUser(user, 'session'), {
			defaultCalendarId: 'cal-mine'
		});

		expect(result.settings).toMatchObject({ defaultCalendarId: 'cal-mine' });
	});

	rollbackTest('does not re-check a stored default calendar on an unrelated change', async (db) => {
		const user = await seedUser(db);
		await seedIdentityCalendar(user.id, 'cal-stale', {}, db);
		await seedIdentitySettings(user.id, { defaultCalendarId: 'cal-stale' }, db);
		// The port would refuse this id; only a patch that SETS a calendar may ask.
		const calendar = memoryCalendar([]);
		const ctx = ctxFor(db, calendar, memoryConsent());

		const result = await updateCalendarSettings(ctx, actorFromUser(user, 'session'), {
			timeZone: 'Asia/Tokyo'
		});

		expect(calendar.calls).toEqual([]);
		expect(result.settings).toMatchObject({
			timeZone: 'Asia/Tokyo',
			defaultCalendarId: 'cal-stale'
		});
	});

	rollbackTest('records the consent transition with the value stored before the save', async (db) => {
		const user = await seedUser(db);
		await seedIdentitySettings(user.id, { showAdsAsEvents: false }, db);
		const consent = memoryConsent();
		const ctx = ctxFor(db, memoryCalendar([]), consent);

		await updateCalendarSettings(ctx, actorFromUser(user, 'session'), {
			showAdsAsEvents: true
		});

		expect(consent.changes).toEqual([{ userId: user.id, previous: false, next: true }]);
	});

	rollbackTest('records nothing itself when the ad setting does not change', async (db) => {
		const user = await seedUser(db);
		await seedIdentitySettings(user.id, { showAdsAsEvents: false }, db);
		const consent = memoryConsent();
		const ctx = ctxFor(db, memoryCalendar([]), consent);

		await updateCalendarSettings(ctx, actorFromUser(user, 'session'), {
			showAdsAsEvents: false
		});

		// The adapter decides whether a transition exists; the service hands it both values.
		expect(consent.changes).toEqual([{ userId: user.id, previous: false, next: false }]);
	});

	rollbackTest('saves and logs when the consent write throws', async (db) => {
		const user = await seedUser(db);
		await seedIdentitySettings(user.id, { showAdsAsEvents: false }, db);
		const ctx = ctxFor(db, memoryCalendar([]), memoryConsent({ failRecord: true }));

		const result = await updateCalendarSettings(ctx, actorFromUser(user, 'session'), {
			showAdsAsEvents: true
		});

		expect(result.settings).toMatchObject({ showAdsAsEvents: true });
		const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(row.showAdsAsEvents).toBe(true);
		expect(ctx.log.entries).toEqual([
			{
				level: 'error',
				event: 'identity_consent_record_failed',
				fields: { userId: user.id, message: 'consent down' }
			}
		]);
	});
});

describe('Dashboard Module switches', () => {
	rollbackTest('creates the settings row with the page defaults plus the hidden list', async (db) => {
		const user = await seedUser(db);
		const ctx = ctxFor(db, memoryCalendar([]), memoryConsent());

		await setHiddenDashboardModules(ctx, actorFromUser(user, 'session'), ['board', 'verse']);

		const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(row).toMatchObject({
			weekStart: 'sunday',
			timeZone: 'UTC',
			color: '#3b82f6',
			defaultView: 'dayView',
			defaultCalendarId: null,
			syncEventsToFamilyCalendar: false,
			showAdsAsEvents: false,
			hiddenDashboardModules: ['board', 'verse']
		});
		expect(row.updatedAt).toEqual(NOW);
	});

	rollbackTest('changes only that column when a settings row exists', async (db) => {
		const user = await seedUser(db);
		await seedIdentitySettings(user.id, {}, db);
		const ctx = ctxFor(db, memoryCalendar([]), memoryConsent());

		await setHiddenDashboardModules(ctx, actorFromUser(user, 'session'), ['board']);

		const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(row.hiddenDashboardModules).toEqual(['board']);
		expect(row).toMatchObject({
			weekStart: 'monday',
			timeZone: 'America/Chicago',
			color: '#112233',
			defaultView: 'dashboard'
		});
	});
});

describe('getStoredCalendarSettings', () => {
	rollbackTest('reads the stored view from ONE query and never touches a port', async (db) => {
		const user = await seedUser(db);
		await seedIdentitySettings(user.id, {}, db);
		// A plain ctx: with no `adConsent` and no `calendarAccess` on it, a call
		// that reached either port would throw instead of answering.
		const ctx = testCtx({ db, now: NOW.toISOString() });

		const view = await getStoredCalendarSettings(ctx, actorFromUser(user, 'session'));

		expect(view).toMatchObject({
			id: 'settings-a',
			userId: user.id,
			timeZone: 'America/Chicago',
			hiddenDashboardModules: ['board']
		});
		expect('verseTranslation' in view).toBe(false);
	});

	rollbackTest('answers the no-row defaults, which carry no id marker', async (db) => {
		const user = await seedUser(db);
		const ctx = testCtx({ db, now: NOW.toISOString() });

		const view = await getStoredCalendarSettings(ctx, actorFromUser(user, 'session'));

		expect(view).toEqual({
			weekStart: 'sunday',
			timeZone: 'UTC',
			color: '#3b82f6',
			defaultView: 'dayView',
			defaultCalendarId: null,
			syncEventsToFamilyCalendar: false,
			showAdsAsEvents: false
		});
		expect('id' in view).toBe(false);
	});
});
