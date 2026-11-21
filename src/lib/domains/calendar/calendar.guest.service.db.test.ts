/**
 * calendar guest merge against real Postgres: the target's Personal Calendar
 * is ensured, and every Event the guest owns lands on it with its id intact.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect } from 'vitest';
import { calendars, events } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { eq } from 'drizzle-orm';
import { seedCalendarRow, seedEventRow } from './calendar.fixtures.server';
import { moveGuestEvents } from './calendar.guest.service.server';

const NOW = '2026-04-01T12:00:00.000Z';
const GUEST_CALENDAR = 'cal-guest-0001';
const OTHER_CALENDAR = 'cal-other-0001';

describe('moveGuestEvents', () => {
	rollbackTest('moves every guest Event onto a fresh personal calendar, ids intact', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const guest = await seedUser(db, { email: 'guest-merge@anonymous.placeholder.invalid' });
		const target = await seedUser(db, { email: 'target-merge@example.test' });
		await seedCalendarRow(GUEST_CALENDAR, { ownerId: guest.id }, db);
		const first = await seedEventRow(
			{ id: 'evt-guest-1', ownerId: guest.id, calendarId: GUEST_CALENDAR, title: 'Swim', start: NOW },
			db
		);
		const second = await seedEventRow(
			{ id: 'evt-guest-2', ownerId: guest.id, calendarId: GUEST_CALENDAR, title: 'Gym', start: NOW },
			db
		);

		expect(await moveGuestEvents(ctx, { from: guest.id, to: target.id })).toBe(2);

		const moved = await db.select().from(events).where(eq(events.ownerId, target.id));
		expect(moved.map((row) => row.id).sort()).toEqual([first.id, second.id].sort());
		const [personal] = await db
			.select()
			.from(calendars)
			.where(eq(calendars.ownerId, target.id));
		expect(personal?.familyId).toBeNull();
		expect(moved.every((row) => row.calendarId === personal?.id)).toBe(true);
		expect(await db.select().from(events).where(eq(events.ownerId, guest.id))).toEqual([]);
	});

	rollbackTest('leaves another person’s Events and the guest’s own calendar alone', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const guest = await seedUser(db, { email: 'guest-scope@anonymous.placeholder.invalid' });
		const target = await seedUser(db, { email: 'target-scope@example.test' });
		const stranger = await seedUser(db, { email: 'stranger-scope@example.test' });
		await seedCalendarRow(OTHER_CALENDAR, { ownerId: stranger.id }, db);
		await seedEventRow(
			{
				id: 'evt-stranger',
				ownerId: stranger.id,
				calendarId: OTHER_CALENDAR,
				title: 'Theirs',
				start: NOW
			},
			db
		);

		expect(await moveGuestEvents(ctx, { from: guest.id, to: target.id })).toBe(0);

		const [kept] = await db.select().from(events).where(eq(events.id, 'evt-stranger'));
		expect(kept?.ownerId).toBe(stranger.id);
		expect(kept?.calendarId).toBe(OTHER_CALENDAR);
	});

	rollbackTest('same person moves nothing', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const person = await seedUser(db, { email: 'same-person@example.test' });
		expect(await moveGuestEvents(ctx, { from: person.id, to: person.id })).toBe(0);
		expect(await db.select().from(calendars)).toEqual([]);
	});
});
