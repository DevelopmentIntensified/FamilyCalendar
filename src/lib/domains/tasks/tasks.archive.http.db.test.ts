/**
 * `GET /api/archive` and the `/calendar/archive` load (#292 G16): the legacy
 * wire — `{events, archiveAllowed, reason?, planName, familyCount,
 * retentionDays, archivedRetentionDays}` — signed-in only, the plan gate
 * applied, personal calendar first, and the page reading the same composition.
 *
 * Expected values come from `src/lib/server/services/archiveData.ts` and the
 * Android spec (docs/guides/task-api-spec.md › G16), never from running this
 * code.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/kernel/db/database.server';
import { invoke, invokeLoad } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import { goldenCtx } from '$lib/app/testing/goldenCtx.server';
import { seedSubscription, seedTier } from '$lib/domains/billing/billing.fixtures.server';
import { seedCalendarRow, seedEventRow } from '$lib/domains/calendar/calendar.fixtures.server';
import { seedFamily, seedMembership } from '$lib/domains/family/family.fixtures.server';
import { GET as getArchive } from '../../../routes/api/archive/+server';
import { load as loadArchivePage } from '../../../routes/(calendar)/calendar/archive/+page.server';

const PERSONAL = 'calpersonal001';
const FAMILY_CAL = 'calfamily0001';
const FAMILY = 'fam-1';
const DAY_MS = 86_400_000;

const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

/** The response body as an object; throws rather than fabricating a shape. */
function bodyObject(value: unknown): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`expected a JSON object, got ${JSON.stringify(value)}`);
	}
	return value as Record<string, unknown>;
}

/** The `events` array of an archive body, checked before it is read. */
function archiveEvents(value: unknown): readonly Record<string, unknown>[] {
	const events = bodyObject(value).events;
	if (!Array.isArray(events)) throw new Error('expected an events array');
	return events.map((event) => bodyObject(event));
}

/** A viewer with a personal and a family calendar, ready for archived rows. */
async function seedArchiveViewer(db: Db) {
	const viewer = await seedUser(db, { firstName: 'Mia' });
	await seedFamily(FAMILY, { name: 'Riveras' }, db);
	await seedMembership(FAMILY, viewer.id, 'creator', 'parent', db);
	await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
	await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);
	return viewer;
}

describe('GET /api/archive', () => {
	beforeEach(truncateAll);

	it('answers 401 {"error":"Unauthorized"} signed out', async () => {
		const res = await invoke(getArchive, { ctx: goldenCtx({ db: testDb() }) });

		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('answers the free plan gate facts and the rows past its look-back window', async () => {
		const db = testDb();
		const viewer = await seedArchiveViewer(db);
		await seedEventRow(
			{
				id: 'evtold000001',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Autumn term starts',
				start: daysAgo(70)
			},
			db
		);
		await seedEventRow(
			{
				id: 'evtfamily001',
				ownerId: viewer.id,
				calendarId: FAMILY_CAL,
				title: 'Bonfire night',
				start: daysAgo(62)
			},
			db
		);
		// Still inside the free plan's 30-day look-back: not archived.
		await seedEventRow(
			{
				id: 'evtrecent001',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Last week',
				start: daysAgo(5)
			},
			db
		);

		const res = await invoke(getArchive, {
			ctx: goldenCtx({ db }),
			user: viewer,
			path: '/api/archive'
		});

		expect(res.status).toBe(200);
		expect(Object.keys(bodyObject(res.body)).sort()).toEqual([
			'archiveAllowed',
			'archivedRetentionDays',
			'events',
			'familyCount',
			'planName',
			'retentionDays'
		]);
		expect(res.body).toMatchObject({
			archiveAllowed: true,
			planName: 'Free',
			familyCount: 1,
			retentionDays: 30,
			archivedRetentionDays: 90
		});
		const listed = archiveEvents(res.body);
		// Personal calendar first, then the family's; each in start order.
		expect(listed.map((event) => event.id)).toEqual(['evtold000001', 'evtfamily001']);
		expect(listed.map((event) => event.calendar)).toEqual(['Personal calendar', 'Riveras']);
		// An Event with no end carries the epoch, as the page always printed.
		expect(listed[0]?.end).toBe('1970-01-01T00:00:00.000Z');
	});

	it('answers the plan windows and display name of a paid tier', async () => {
		const db = testDb();
		const viewer = await seedArchiveViewer(db);
		const tier = await seedTier(db, {
			displayName: 'Family',
			tierName: 'family',
			retentionViewDays: 365,
			archivedRetentionDays: 730
		});
		await seedSubscription(db, viewer.id, { subscriptionTypeId: tier.id });

		const res = await invoke(getArchive, {
			ctx: goldenCtx({ db }),
			user: viewer,
			path: '/api/archive'
		});

		expect(res.body).toMatchObject({
			archiveAllowed: true,
			planName: 'Family',
			retentionDays: 365,
			archivedRetentionDays: 730
		});
	});

	it('refuses a plan that keeps no archive, with the reason and no rows', async () => {
		const db = testDb();
		const viewer = await seedArchiveViewer(db);
		const tier = await seedTier(db, { archivedRetentionDays: 0 });
		await seedSubscription(db, viewer.id, { subscriptionTypeId: tier.id });
		await seedEventRow(
			{
				id: 'evtold000001',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Old memory',
				start: daysAgo(70)
			},
			db
		);

		const res = await invoke(getArchive, {
			ctx: goldenCtx({ db }),
			user: viewer,
			path: '/api/archive'
		});

		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({
			events: [],
			archiveAllowed: false,
			reason: 'Archive view not available on your plan',
			familyCount: 1,
			retentionDays: 3650,
			archivedRetentionDays: 0
		});
	});

	it('reads only the caller`s own family and calendars', async () => {
		const db = testDb();
		const viewer = await seedArchiveViewer(db);
		const stranger = await seedUser(db, { firstName: 'Sam' });
		await seedCalendarRow('calstranger01', { ownerId: stranger.id }, db);
		await seedEventRow(
			{
				id: 'evtstranger1',
				ownerId: stranger.id,
				calendarId: 'calstranger01',
				title: 'Not mine',
				start: daysAgo(70)
			},
			db
		);

		const res = await invoke(getArchive, {
			ctx: goldenCtx({ db }),
			user: viewer,
			path: '/api/archive'
		});

		expect(archiveEvents(res.body)).toEqual([]);
	});
});

describe('GET /calendar/archive — the page load', () => {
	beforeEach(truncateAll);

	it('answers the same composition as the endpoint', async () => {
		const db = testDb();
		const viewer = await seedArchiveViewer(db);
		await seedEventRow(
			{
				id: 'evtold000001',
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Autumn term starts',
				start: daysAgo(70)
			},
			db
		);

		const page = await invokeLoad(loadArchivePage, {
			ctx: goldenCtx({ db }),
			user: viewer,
			path: '/calendar/archive'
		});
		const res = await invoke(getArchive, {
			ctx: goldenCtx({ db }),
			user: viewer,
			path: '/api/archive'
		});

		expect(page).toMatchObject({
			archiveAllowed: true,
			planName: 'Free',
			familyCount: 1,
			retentionDays: 30,
			archivedRetentionDays: 90
		});
		expect(page.events.map((event) => event.id)).toEqual(['evtold000001']);
		expect(page.events[0]?.start).toBeInstanceOf(Date);
		expect(res.body).toMatchObject({ archiveAllowed: page.archiveAllowed, planName: page.planName });
	});
});
