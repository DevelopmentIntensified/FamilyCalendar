/**
 * `getArchivePage` against real Postgres: the gate's facts, the look-back
 * cutoff, the personal-then-family order and the refusal, each seeded through
 * the owning modules' fixtures and rolled back.
 *
 * Expected values come from `src/lib/server/services/archiveData.ts` (the
 * legacy loader this composes) and the Android spec's G16 entry, never from
 * running this code.
 */
import { describe, expect } from 'vitest';
import type { Db } from '$lib/kernel/db/database.server';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { seedSubscription, seedTier } from '$lib/domains/billing/billing.fixtures.server';
import { seedCalendarRow, seedEventRow } from '$lib/domains/calendar/calendar.fixtures.server';
import { seedFamily, seedMembership } from '$lib/domains/family/family.fixtures.server';
import { getArchivePage } from './tasks.archive.service.server';

const NOW = '2026-03-01T09:00:00.000Z';
const PERSONAL = 'calpersonal001';
const FAMILY_CAL = 'calfamily0001';
const FAMILY = 'fam-1';
const DAY_MS = 86_400_000;

/** A `NOW`-relative instant, so a test's window arithmetic never drifts. */
const daysBeforeNow = (days: number) => new Date(Date.parse(NOW) - days * DAY_MS).toISOString();

async function seedArchiveViewer(db: Db) {
	const viewer = await seedUser(db, { firstName: 'Mia' });
	await seedFamily(FAMILY, { name: 'Riveras' }, db);
	await seedMembership(FAMILY, viewer.id, 'creator', 'parent', db);
	await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
	await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);
	return viewer;
}

describe('getArchivePage', () => {
	rollbackTest('answers the free gate facts and the rows past its window', async (db) => {
		const viewer = await seedArchiveViewer(db);
		await seedEventRow(
			{
				id: 'evtold000001',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Autumn term starts',
				start: daysBeforeNow(70)
			},
			db
		);
		await seedEventRow(
			{
				id: 'evtfamily001',
				ownerId: viewer.id,
				calendarId: FAMILY_CAL,
				title: 'Bonfire night',
				start: daysBeforeNow(62)
			},
			db
		);
		// Five days ago: inside the free plan's 30-day look-back, so not archived.
		await seedEventRow(
			{
				id: 'evtrecent001',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Last week',
				start: daysBeforeNow(5)
			},
			db
		);

		const page = await getArchivePage(testCtx({ db, now: NOW }), actorFromUser(viewer, 'session'));

		expect(page).toMatchObject({
			archiveAllowed: true,
			planName: 'Free',
			familyCount: 1,
			retentionDays: 30,
			archivedRetentionDays: 90
		});
		expect(page.events.map((event) => event.id)).toEqual(['evtold000001', 'evtfamily001']);
		expect(page.events.map((event) => event.calendar)).toEqual(['Personal calendar', 'Riveras']);
		expect(page.events[0]?.start.toISOString()).toBe(daysBeforeNow(70));
		// No end on the row: the epoch, as the page and the phone always saw.
		expect(page.events[0]?.end.toISOString()).toBe('1970-01-01T00:00:00.000Z');
	});

	rollbackTest('reads the plan windows and the display name of a paid tier', async (db) => {
		const viewer = await seedArchiveViewer(db);
		const tier = await seedTier(db, {
			displayName: 'Family',
			tierName: 'family',
			retentionViewDays: 365,
			archivedRetentionDays: 730
		});
		await seedSubscription(db, viewer.id, { subscriptionTypeId: tier.id });

		const page = await getArchivePage(testCtx({ db, now: NOW }), actorFromUser(viewer, 'session'));

		expect(page).toMatchObject({
			archiveAllowed: true,
			planName: 'Family',
			retentionDays: 365,
			archivedRetentionDays: 730
		});
	});

	rollbackTest('refuses a plan with no archive, keeping the gate facts', async (db) => {
		const viewer = await seedArchiveViewer(db);
		const tier = await seedTier(db, { archivedRetentionDays: 0 });
		await seedSubscription(db, viewer.id, { subscriptionTypeId: tier.id });
		await seedEventRow(
			{
				id: 'evtold000001',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Old memory',
				start: daysBeforeNow(70)
			},
			db
		);

		const page = await getArchivePage(testCtx({ db, now: NOW }), actorFromUser(viewer, 'session'));

		expect(page).toEqual({
			events: [],
			archiveAllowed: false,
			reason: 'Archive view not available on your plan',
			planName: 'Family Master',
			familyCount: 1,
			retentionDays: 3650,
			archivedRetentionDays: 0
		});
	});

	rollbackTest('counts only the viewer`s families and reads only their calendars', async (db) => {
		const viewer = await seedUser(db);
		const stranger = await seedUser(db, { firstName: 'Sam' });
		await seedFamily('fam-stranger', { name: 'Strangers' }, db);
		await seedMembership('fam-stranger', stranger.id, 'creator', 'parent', db);
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, viewer.id, 'member', 'parent', db);
		await seedCalendarRow('calstranger01', { familyId: 'fam-stranger' }, db);
		await seedEventRow(
			{
				id: 'evtstranger1',
				ownerId: stranger.id,
				calendarId: 'calstranger01',
				title: 'Not mine',
				start: daysBeforeNow(70)
			},
			db
		);

		const page = await getArchivePage(testCtx({ db, now: NOW }), actorFromUser(viewer, 'session'));

		expect(page.familyCount).toBe(1);
		expect(page.events).toEqual([]);
	});
});
