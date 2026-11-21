/**
 * calendar bulk services against real Postgres: the five operations, the
 * per-item failure accounting, the two 422 answers and the two access gaps the
 * golden pins as today's behaviour.
 *
 * Expected values come from `bulkApplyService.ts` + the bulk route and the
 * frozen `calendar.bulk.http.db.test.ts`.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect, vi } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import { AppError } from '$lib/kernel/errors/appError';
import type { Db } from '$lib/kernel/db/database.server';
import { deviceTokens, eventAttendance, events, userSettings } from '$lib/kernel/db/tables.server';
import { createMemoryPush } from '$lib/kernel/push/push';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx, type TestCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedFamily, seedMembership } from '$lib/domains/family/family.fixtures.server';
import {
	seedAttendanceRow,
	seedCalendarRow,
	seedEventRow
} from './calendar.fixtures.server';
import { bulkEditEvents } from './calendar.bulk.service.server';

const NOW = '2026-01-15T09:00:00.000Z';
const PERSONAL_CAL = 'cal-personal01';
const FAMILY_CAL = 'cal-family01';
const FAMILY = 'fam-riveras01';

function viewerCtx(db: Db) {
	return testCtx({ db, now: NOW });
}

/** A viewer with two one-off events on their personal calendar. */
async function seedOwned(db: Db) {
	const user = await seedUser(db, { firstName: 'Mia' });
	await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);
	await seedEventRow(
		{
			id: 'evtoneoff01',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Soccer practice',
			start: '2026-10-05T09:00:00.000Z',
			end: '2026-10-05T10:00:00.000Z'
		},
		db
	);
	await seedEventRow(
		{
			id: 'evtoneoff02',
			ownerId: user.id,
			calendarId: PERSONAL_CAL,
			title: 'Piano',
			start: '2026-10-06T15:00:00.000Z',
			end: '2026-10-06T16:00:00.000Z'
		},
		db
	);
	return user;
}

/** The thrown refusal, so a test can assert its status and copy. */
async function refusalOf(work: Promise<unknown>): Promise<unknown> {
	return await work.catch((error: unknown) => error);
}

async function eventRows(db: Db) {
	return await db
		.select({
			id: events.id,
			calendarId: events.calendarId,
			title: events.title,
			location: events.location,
			start: events.start,
			end: events.end
		})
		.from(events)
		.orderBy(events.id);
}

describe('bulkEditEvents', () => {
	rollbackTest('refuses a body without ids and op, without valid ids, or with no editable match', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedOwned(db);
		const actor = actorFromUser(user, 'session');

		expect(
			await refusalOf(bulkEditEvents(ctx, actor, { ids: [{ id: 'evtoneoff01' }] }))
		).toMatchObject({ status: 400, message: 'ids and op are required' });
		expect(
			await refusalOf(
				bulkEditEvents(ctx, actor, { ids: [{ id: 'x' }], op: { type: 'delete' } })
			)
		).toMatchObject({ status: 400, message: 'No valid event ids' });
		expect(
			await refusalOf(
				bulkEditEvents(ctx, actor, { ids: [{ id: 'missingevent1' }], op: { type: 'delete' } })
			)
		).toMatchObject({ status: 403, message: 'No editable events matched' });
		expect(
			await refusalOf(
				bulkEditEvents(ctx, actor, { ids: [{ id: 'evtoneoff01' }], op: { type: 'frobnicate' } })
			)
		).toMatchObject({ status: 400, message: 'Unknown op type' });
	});

	rollbackTest('deletes every selected event, once each, and reports what applied', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedOwned(db);

		const result = await bulkEditEvents(ctx, actorFromUser(user, 'session'), {
			ids: [
				{ id: 'evtoneoff01' },
				{ id: 'evtoneoff01~2026-10-05T09:00:00.000Z' },
				{ id: 'evtoneoff02' }
			],
			op: { type: 'delete' }
		});

		expect(result).toEqual({ success: true, applied: 2, failed: [] });
		expect(await db.select({ id: events.id }).from(events)).toEqual([]);
	});

	rollbackTest('moves every selected event onto another accessible calendar', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedOwned(db);
		await seedCalendarRow('cal-second001', { ownerId: user.id }, db);

		const result = await bulkEditEvents(ctx, actorFromUser(user, 'session'), {
			ids: [{ id: 'evtoneoff01' }, { id: 'evtoneoff02' }],
			op: { type: 'calendar', calendarId: 'cal-second001' }
		});

		expect(result).toEqual({ success: true, applied: 2, failed: [] });
		expect((await eventRows(db)).map((row) => row.calendarId)).toEqual([
			'cal-second001',
			'cal-second001'
		]);
	});

	rollbackTest('answers 400 and 403 for a calendar move', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedOwned(db);
		const stranger = await seedUser(db);
		await seedCalendarRow('cal-stranger1', { ownerId: stranger.id }, db);
		const actor = actorFromUser(user, 'session');

		expect(
			await refusalOf(
				bulkEditEvents(ctx, actor, {
					ids: [{ id: 'evtoneoff01' }],
					op: { type: 'calendar' }
				})
			)
		).toMatchObject({ status: 400, message: 'calendarId required' });
		expect(
			await refusalOf(
				bulkEditEvents(ctx, actor, {
					ids: [{ id: 'evtoneoff01' }],
					op: { type: 'calendar', calendarId: 'cal-stranger1' }
				})
			)
		).toMatchObject({ status: 403, message: 'Calendar not accessible' });
	});

	rollbackTest('sets the location on every selected event, and a blank location clears it', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedOwned(db);
		const actor = actorFromUser(user, 'session');

		const result = await bulkEditEvents(ctx, actor, {
			ids: [{ id: 'evtoneoff01' }, { id: 'evtoneoff02' }],
			op: { type: 'location', location: '  Park  ' }
		});
		expect(result).toEqual({ success: true, applied: 2, failed: [] });
		expect((await eventRows(db)).map((row) => row.location)).toEqual(['Park', 'Park']);

		await bulkEditEvents(ctx, actor, {
			ids: [{ id: 'evtoneoff01' }],
			op: { type: 'location', location: '   ' }
		});
		expect((await eventRows(db)).map((row) => row.location)).toEqual([null, 'Park']);
	});

	rollbackTest('merges guest names case-insensitively and needs at least one name', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedOwned(db);
		await seedAttendanceRow(
			{ eventId: 'evtoneoff01', name: 'Grandma', status: 'undecided', inviteType: 'optional' },
			db
		);
		const actor = actorFromUser(user, 'session');

		const result = await bulkEditEvents(ctx, actor, {
			ids: [{ id: 'evtoneoff01' }],
			op: { type: 'attendants', add: ['grandma', ' Bob ', ''] }
		});
		expect(result).toEqual({ success: true, applied: 1, failed: [] });
		const guests = await db
			.select({ name: eventAttendance.name })
			.from(eventAttendance)
			.where(eq(eventAttendance.eventId, 'evtoneoff01'));
		expect(guests.map((row) => row.name).sort()).toEqual(['Bob', 'Grandma']);

		expect(
			await refusalOf(
				bulkEditEvents(ctx, actor, {
					ids: [{ id: 'evtoneoff01' }],
					op: { type: 'attendants', add: [] }
				})
			)
		).toMatchObject({ status: 400, message: 'add names required' });
	});

	rollbackTest('plans a smart edit deterministically from an absolute date (dryRun writes nothing)', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedOwned(db);
		await db.insert(userSettings).values({ userId: user.id, timeZone: 'utc' });

		const result = await bulkEditEvents(ctx, actorFromUser(user, 'session'), {
			ids: [{ id: 'evtoneoff01' }],
			op: { type: 'smart', instruction: 'move everything to 2026-10-06' },
			dryRun: true
		});

		expect(result).toEqual({
			success: true,
			plan: [{ id: 'evtoneoff01', date: '2026-10-06' }]
		});
		const [row] = (await eventRows(db)).filter((event) => event.id === 'evtoneoff01');
		expect(new Date(String(row?.start)).toISOString()).toBe('2026-10-05T09:00:00.000Z');
	});

	rollbackTest('applies a smart date move in the viewer zone and keeps the time of day', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedOwned(db);
		await db.insert(userSettings).values({ userId: user.id, timeZone: 'utc' });

		const result = await bulkEditEvents(ctx, actorFromUser(user, 'session'), {
			ids: [{ id: 'evtoneoff01' }],
			op: { type: 'smart', instruction: 'move everything to 2026-10-06' }
		});

		expect(result).toEqual({ success: true, applied: 1 });
		const [row] = (await eventRows(db)).filter((event) => event.id === 'evtoneoff01');
		expect(row?.title).toBe('Soccer practice');
		expect(new Date(String(row?.start)).toISOString()).toBe('2026-10-06T09:00:00.000Z');
		expect(new Date(String(row?.end)).toISOString()).toBe('2026-10-06T10:00:00.000Z');
	});

	rollbackTest('throws the 422 when the instruction matches nothing and when a posted plan names no editable id', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedOwned(db);
		const actor = actorFromUser(user, 'session');

		const nothing = await bulkEditEvents(ctx, actor, {
			ids: [{ id: 'evtoneoff01' }],
			op: { type: 'smart', instruction: 'hello there' }
		}).catch((error: unknown) => error);
		expect(nothing).toBeInstanceOf(AppError);
		expect(nothing).toMatchObject({
			status: 422,
			message: 'Could not match that instruction. Try naming a date or the events.'
		});

		const foreignPlan = await bulkEditEvents(ctx, actor, {
			ids: [{ id: 'evtoneoff01' }],
			op: { type: 'smart', instruction: 'reviewed plan' },
			plan: [{ id: 'somebodyelse1', date: '2026-10-06' }]
		}).catch((error: unknown) => error);
		expect(foreignPlan).toBeInstanceOf(AppError);
		expect(foreignPlan).toMatchObject({ status: 422, message: 'No valid changes in plan' });
	});

	rollbackTest("counts only what really applied: an uneditable match fails per item", async (db) => {
		const ctx = viewerCtx(db);
		const owner = await seedUser(db, { firstName: 'Mia' });
		const partner = await seedUser(db, { firstName: 'Sam' });
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, owner.id, 'member', 'member', db);
		await seedMembership(FAMILY, partner.id, 'member', 'member', db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);
		await seedEventRow(
			{
				id: 'evtoneoff01',
				ownerId: owner.id,
				calendarId: FAMILY_CAL,
				title: 'Family dinner',
				start: '2026-10-09T18:00:00.000Z'
			},
			db
		);

		const result = await bulkEditEvents(ctx, actorFromUser(partner, 'session'), {
			ids: [{ id: 'evtoneoff01' }],
			op: { type: 'delete' }
		});

		expect(result).toEqual({
			success: true,
			applied: 0,
			failed: [{ id: 'evtoneoff01', error: 'not found' }]
		});
		expect(await db.select({ id: events.id }).from(events)).toHaveLength(1);
	});

	rollbackTest("lets any reader merge attendants into another member's event", async (db) => {
		const ctx = viewerCtx(db);
		const owner = await seedUser(db, { firstName: 'Mia' });
		const partner = await seedUser(db, { firstName: 'Sam' });
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, owner.id, 'member', 'member', db);
		await seedMembership(FAMILY, partner.id, 'member', 'member', db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);
		await seedEventRow(
			{
				id: 'evtoneoff01',
				ownerId: owner.id,
				calendarId: FAMILY_CAL,
				title: 'Family dinner',
				start: '2026-10-09T18:00:00.000Z'
			},
			db
		);

		const result = await bulkEditEvents(ctx, actorFromUser(partner, 'session'), {
			ids: [{ id: 'evtoneoff01' }],
			op: { type: 'attendants', add: ['Grandma'] }
		});

		expect(result).toEqual({ success: true, applied: 1, failed: [] });
		expect(
			await db
				.select({ name: eventAttendance.name, status: eventAttendance.status })
				.from(eventAttendance)
				.where(eq(eventAttendance.eventId, 'evtoneoff01'))
		).toEqual([{ name: 'Grandma', status: 'undecided' }]);
	});

	rollbackTest('counts a smart plan delete as applied even when nothing was deleted', async (db) => {
		const ctx = viewerCtx(db);
		const owner = await seedUser(db, { firstName: 'Mia' });
		const partner = await seedUser(db, { firstName: 'Sam' });
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, owner.id, 'member', 'member', db);
		await seedMembership(FAMILY, partner.id, 'member', 'member', db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);
		await seedEventRow(
			{
				id: 'evtoneoff01',
				ownerId: owner.id,
				calendarId: FAMILY_CAL,
				title: 'Family dinner',
				start: '2026-10-09T18:00:00.000Z'
			},
			db
		);

		const result = await bulkEditEvents(ctx, actorFromUser(partner, 'session'), {
			ids: [{ id: 'evtoneoff01' }],
			op: { type: 'smart', instruction: 'reviewed plan' },
			plan: [{ id: 'evtoneoff01', delete: true }]
		});

		expect(result).toEqual({ success: true, applied: 1 });
		expect(await db.select({ id: events.id }).from(events)).toHaveLength(1);
	});

	// #272: the nudge is ONE message per REQUEST (legacy `nudge.test.ts`
	// checked this through the routes; here the memory push port counts it).
	rollbackTest('sends exactly ONE events_changed nudge for a three-event bulk', async (db) => {
		const viewer = await seedUser(db, { firstName: 'Mia' });
		const partner = await seedUser(db, { firstName: 'Sam' });
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, viewer.id, 'creator', 'parent', db);
		await seedMembership(FAMILY, partner.id, 'member', 'member', db);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: viewer.id }, db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);
		await db.insert(deviceTokens).values({ userId: partner.id, token: 'token-partner' });
		for (const id of ['evtbulk00001', 'evtbulk00002', 'evtbulk00003']) {
			await seedEventRow(
				{
					id,
					ownerId: viewer.id,
					calendarId: PERSONAL_CAL,
					title: `Bulk ${id}`,
					start: '2026-10-05T09:00:00.000Z'
				},
				db
			);
		}

		const ctx: TestCtx = {
			...testCtx({ db, now: NOW }),
			push: createMemoryPush({ devicesConfigured: true })
		};
		await bulkEditEvents(ctx, actorFromUser(viewer, 'session'), {
			ids: [{ id: 'evtbulk00001' }, { id: 'evtbulk00002' }, { id: 'evtbulk00003' }],
			op: { type: 'delete' }
		});

		await vi.waitFor(() => expect(ctx.push.sent).toHaveLength(1));
		expect(ctx.push.sent[0]).toMatchObject({ channel: 'device', token: 'token-partner' });
	});
});
