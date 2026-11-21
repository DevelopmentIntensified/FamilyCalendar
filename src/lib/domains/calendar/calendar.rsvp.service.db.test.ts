/**
 * The calendar rsvp services against real Postgres: the attendance read, the
 * viewer upsert and the guest invite, one test per behaviour the goldens pin.
 * Each runs in `rollbackTest`; the ctx carries a fixed clock.
 *
 * Expected values come from `src/routes/api/events/[id]/rsvp/+server.ts` and
 * the frozen `calendar.events.http.db.test.ts` — the pair needs read access
 * only, `rsvpStatus` carries the raw rows (Q-046) and a composite occurrence id
 * is "not found".
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import { eventAttendance } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedFamily, seedMembership } from '$lib/domains/family/family.fixtures.server';
import { seedCalendarRow, seedEventRow } from './calendar.fixtures.server';
import { getEventAttendance, inviteEventGuest, rsvpEvent } from './calendar.rsvp.service.server';

const NOW = '2026-03-01T09:00:00.000Z';
const PERSONAL = 'calperson0001';
const FAMILY = 'fam-1';
const FAMILY_CAL = 'calfamily0001';
const EVENT = 'evtoneoff01';

/** One owned event, plus the two attendance rows the goldens seed. */
async function seedEventWithGuests(db: Db) {
	const viewer = await seedUser(db, { firstName: 'Mia', lastName: 'Rivera' });
	await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
	await seedEventRow(
		{
			id: EVENT,
			ownerId: viewer.id,
			calendarId: PERSONAL,
			title: 'Dentist',
			start: '2026-10-07T13:00:00.000Z'
		},
		db
	);
	await db.insert(eventAttendance).values([
		{ eventId: EVENT, userId: viewer.id, status: 'going', inviteType: 'optional' },
		{ eventId: EVENT, userId: null, name: 'Grandma', status: 'undecided', inviteType: 'optional' }
	]);
	return viewer;
}

describe('getEventAttendance', () => {
	rollbackTest('lists the attendance, the viewer RSVP and the guest names', async (db) => {
		const viewer = await seedEventWithGuests(db);

		const result = await getEventAttendance(
			testCtx({ db, now: NOW }),
			actorFromUser(viewer, 'session'),
			EVENT
		);

		expect(result.userRsvpStatus).toBe('going');
		expect(result.nonUserAttendants).toEqual(['Grandma']);
		expect(result.attendance).toHaveLength(2);
		expect(result.attendance).toEqual(
			expect.arrayContaining([
				{
					id: expect.any(String),
					eventId: EVENT,
					userId: viewer.id,
					name: null,
					status: 'going',
					inviteType: 'optional',
					firstName: 'Mia',
					lastName: 'Rivera'
				},
				{
					id: expect.any(String),
					eventId: EVENT,
					userId: null,
					name: 'Grandma',
					status: 'undecided',
					inviteType: 'optional',
					firstName: null,
					lastName: null
				}
			])
		);
	});

	rollbackTest('defaults the viewer RSVP to undecided when there is no row', async (db) => {
		const owner = await seedUser(db, { firstName: 'Mia' });
		const partner = await seedUser(db, { firstName: 'Sam' });
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, owner.id, 'creator', 'parent', db);
		await seedMembership(FAMILY, partner.id, 'member', 'member', db);
		await seedCalendarRow(FAMILY_CAL, { familyId: FAMILY }, db);
		await seedEventRow(
			{
				id: EVENT,
				ownerId: owner.id,
				calendarId: FAMILY_CAL,
				title: 'Dentist',
				start: '2026-10-07T13:00:00.000Z'
			},
			db
		);

		const result = await getEventAttendance(
			testCtx({ db, now: NOW }),
			actorFromUser(partner, 'session'),
			EVENT
		);

		expect(result).toEqual({ attendance: [], userRsvpStatus: 'undecided', nonUserAttendants: [] });
	});

	rollbackTest('answers 404 for an unknown or composite id and 403 for a stranger', async (db) => {
		await seedEventWithGuests(db);
		const stranger = await seedUser(db);
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(stranger, 'session');

		await expect(getEventAttendance(ctx, actor, 'missingevent1')).rejects.toMatchObject({
			status: 404,
			message: 'Event not found'
		});
		// The rsvp pair looks the id up with no occurrence resolution.
		await expect(
			getEventAttendance(ctx, actor, `${EVENT}~2026-10-13T15:00:00.000Z`)
		).rejects.toMatchObject({ status: 404, message: 'Event not found' });
		await expect(getEventAttendance(ctx, actor, EVENT)).rejects.toMatchObject({
			status: 403,
			message: 'No access to this event'
		});
	});
});

describe('rsvpEvent', () => {
	async function seedOwnedEvent(db: Db) {
		const viewer = await seedUser(db, { firstName: 'Mia', lastName: 'Rivera' });
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedEventRow(
			{
				id: EVENT,
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Dentist',
				start: '2026-10-07T13:00:00.000Z'
			},
			db
		);
		return viewer;
	}

	rollbackTest('upserts the viewer RSVP and answers the rows on both fields', async (db) => {
		const viewer = await seedOwnedEvent(db);

		const result = await rsvpEvent(
			testCtx({ db, now: NOW }),
			actorFromUser(viewer, 'session'),
			EVENT,
			{ status: 'maybe' }
		);

		expect(result).toEqual({
			success: true,
			rsvpStatus: [
				{
					id: expect.any(String),
					eventId: EVENT,
					userId: viewer.id,
					name: null,
					status: 'maybe',
					inviteType: 'optional'
				}
			],
			attendance: [
				{
					id: expect.any(String),
					eventId: EVENT,
					userId: viewer.id,
					name: null,
					status: 'maybe',
					inviteType: 'optional',
					firstName: 'Mia',
					lastName: 'Rivera'
				}
			]
		});
		const rows = await db.select().from(eventAttendance);
		expect(rows).toHaveLength(1);
	});

	rollbackTest('clearing the answer stores undecided', async (db) => {
		const viewer = await seedOwnedEvent(db);
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(viewer, 'session');

		await rsvpEvent(ctx, actor, EVENT, { status: 'going' });
		const result = await rsvpEvent(ctx, actor, EVENT, { status: 'undecided' });

		expect(result.attendance[0]).toEqual(
			expect.objectContaining({ userId: viewer.id, status: 'undecided' })
		);
	});

	rollbackTest('answers 400 for anything outside the four answers', async (db) => {
		const viewer = await seedOwnedEvent(db);

		await expect(
			rsvpEvent(testCtx({ db, now: NOW }), actorFromUser(viewer, 'session'), EVENT, {
				status: 'excited'
			})
		).rejects.toMatchObject({ status: 400, message: 'Invalid RSVP status' });
	});
});

describe('inviteEventGuest', () => {
	async function seedOwnedEvent(db: Db) {
		const viewer = await seedUser(db);
		await seedCalendarRow(PERSONAL, { ownerId: viewer.id }, db);
		await seedEventRow(
			{
				id: EVENT,
				ownerId: viewer.id,
				calendarId: PERSONAL,
				title: 'Dentist',
				start: '2026-10-07T13:00:00.000Z'
			},
			db
		);
		return viewer;
	}

	rollbackTest('adds a trimmed guest once and answers the attendance only', async (db) => {
		const viewer = await seedOwnedEvent(db);
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(viewer, 'session');

		const first = await inviteEventGuest(ctx, actor, EVENT, { guest: '  Grandma  ' });
		expect(first.success).toBe(true);
		expect(first.attendance).toEqual([
			{
				id: expect.any(String),
				eventId: EVENT,
				userId: null,
				name: 'Grandma',
				status: 'undecided',
				inviteType: 'optional',
				firstName: null,
				lastName: null
			}
		]);

		// A name already on the event is not added twice (case-insensitive).
		const again = await inviteEventGuest(ctx, actor, EVENT, { guest: 'grandma' });
		expect(again.attendance).toHaveLength(1);
	});

	rollbackTest('answers 400 Guest name is required for a blank or non-string name', async (db) => {
		const viewer = await seedOwnedEvent(db);
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(viewer, 'session');

		await expect(inviteEventGuest(ctx, actor, EVENT, { guest: '   ' })).rejects.toMatchObject({
			status: 400,
			message: 'Guest name is required'
		});
		await expect(inviteEventGuest(ctx, actor, EVENT, { guest: 5 })).rejects.toMatchObject({
			status: 400,
			message: 'Guest name is required'
		});
	});
});
