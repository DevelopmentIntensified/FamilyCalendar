/**
 * calendar page loads against real Postgres: `/calendar/event/[id]`,
 * `/calendar/import` and `/calendar/print`. Page loads get no goldens (their
 * data is internal and redesigned with the UI), so these drive the PORTED
 * handlers through the kernel's harness and every expected value comes from
 * the legacy routes' own source (`+page.server.ts` of each page).
 *
 * The three auth levels are the legacy ones: the detail and print pages
 * redirect a signed-out visitor to `/login`, the importer keeps the page and
 * answers an empty calendar list.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import type { Db } from '$lib/kernel/db/database.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { invokeLoad } from '$lib/kernel/testing/invokeHandlers.server';
import { seedCalendarRow, seedEventRow } from './calendar.fixtures.server';
import {
	calendarEventDetailPage,
	calendarImportPage,
	calendarPrintPage
} from './calendar.pages.http.server';

const NOW = '2026-01-15T09:00:00.000Z';
const PERSONAL_CAL = 'cal-pages-personal';

function viewerCtx(db: Db) {
	return testCtx({ db, now: NOW });
}

/** A thrown Kit redirect or error, as the harness surfaces it. */
async function failureOf(run: () => Promise<unknown>): Promise<{
	status: number;
	location?: string;
	body?: { message?: string };
}> {
	try {
		await run();
	} catch (cause) {
		const value = cause as { status?: number; location?: string; body?: { message?: string } };
		return { status: value.status ?? 0, location: value.location, body: value.body };
	}
	throw new Error('expected the handler to refuse, but it answered');
}

describe('/calendar/event/[id] load', () => {
	rollbackTest('redirects a signed-out visitor to /login (legacy 302)', async (db) => {
		const failure = await failureOf(() =>
			invokeLoad(calendarEventDetailPage, { ctx: viewerCtx(db), path: '/calendar/event/e1' })
		);

		expect(failure.status).toBe(302);
		expect(failure.location).toBe('/login');
	});

	rollbackTest('answers 404 Event not found for an unknown id', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);

		const failure = await failureOf(() =>
			invokeLoad(calendarEventDetailPage, {
				ctx,
				user,
				path: '/calendar/event/evtmissing01',
				params: { id: 'evtmissing01' }
			})
		);

		expect(failure.status).toBe(404);
		expect(failure.body?.message).toBe('Event not found');
	});

	rollbackTest('answers 403 No access to this event when neither owner nor calendar grants it', async (db) => {
		const ctx = viewerCtx(db);
		const owner = await seedUser(db, { firstName: 'Ann', lastName: 'Lee' });
		const stranger = await seedUser(db, { firstName: 'Bob', lastName: 'Roy' });
		await seedEventRow(
			{
				id: 'evtprivate001',
				ownerId: owner.id,
				calendarId: null,
				title: 'Private thing',
				start: '2026-01-20T10:00:00.000Z',
				end: '2026-01-20T11:00:00.000Z'
			},
			db
		);

		const failure = await failureOf(() =>
			invokeLoad(calendarEventDetailPage, {
				ctx,
				user: stranger,
				path: '/calendar/event/evtprivate001',
				params: { id: 'evtprivate001' }
			})
		);

		expect(failure.status).toBe(403);
		expect(failure.body?.message).toBe('No access to this event');
	});

	rollbackTest('hands the owner the event, its calendar facts and the layout zone', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);
		await seedEventRow(
			{
				id: 'evtowned0001',
				ownerId: user.id,
				calendarId: PERSONAL_CAL,
				title: 'Soccer practice',
				start: '2026-01-20T10:00:00.000Z',
				end: '2026-01-20T11:00:00.000Z'
			},
			db
		);

		const data = await invokeLoad(calendarEventDetailPage, {
			ctx,
			user,
			path: '/calendar/event/evtowned0001',
			params: { id: 'evtowned0001' },
			parentData: { settings: { timeZone: 'Europe/London' } }
		});

		expect(data.event.title).toBe('Soccer practice');
		expect(data.event.start).toBeInstanceOf(Date);
		expect(data.calendar?.id).toBe(PERSONAL_CAL);
		// A personal calendar is not the family's.
		expect(data.isFamilyEvent).toBe(false);
		expect(data.timeZone).toBe('Europe/London');
		expect(data.userRsvpStatus).toBe('undecided');
	});
});

describe('/calendar/import load', () => {
	rollbackTest('keeps the page for a signed-out caller and answers no calendars', async (db) => {
		const data = await invokeLoad(calendarImportPage, {
			ctx: viewerCtx(db),
			path: '/calendar/import'
		});

		expect(data).toEqual({ calendars: [] });
	});

	rollbackTest('lists the viewer`s own calendars the way the picker labels them', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);

		const data = await invokeLoad(calendarImportPage, {
			ctx,
			user,
			path: '/calendar/import'
		});

		expect(data.calendars).toEqual([{ id: PERSONAL_CAL, name: 'Personal Calendar' }]);
	});
});

describe('/calendar/print load', () => {
	rollbackTest('redirects a signed-out visitor to /login (legacy 302)', async (db) => {
		const failure = await failureOf(() =>
			invokeLoad(calendarPrintPage, { ctx: viewerCtx(db), path: '/calendar/print' })
		);

		expect(failure.status).toBe(302);
		expect(failure.location).toBe('/login');
	});

	rollbackTest('answers the requested month with its neighbours, week start and items', async (db) => {
		const ctx = viewerCtx(db);
		const user = await seedUser(db);
		await seedCalendarRow(PERSONAL_CAL, { ownerId: user.id }, db);
		await seedEventRow(
			{
				id: 'evtprinted001',
				ownerId: user.id,
				calendarId: PERSONAL_CAL,
				title: 'Swim class',
				start: '2026-01-20T09:00:00.000Z',
				end: '2026-01-20T10:00:00.000Z'
			},
			db
		);

		const data = await invokeLoad(calendarPrintPage, {
			ctx,
			user,
			path: '/calendar/print?year=2026&month=1'
		});

		expect(data.year).toBe(2026);
		expect(data.month).toBe(1);
		expect(data.monthName).toBe('January');
		expect(data.prev).toEqual({ year: 2025, month: 12 });
		expect(data.next).toEqual({ year: 2026, month: 2 });
		expect(data.weekStart).toBe('sunday');
		expect(data.familyName).toBeNull();
		// January 2026 starts on a Thursday: the Sunday-first grid is 5 weeks.
		expect(data.grid).toHaveLength(35);
		const printed = data.grid.find((cell) => cell.iso === '2026-01-20');
		expect(printed?.items).toEqual([
			{ title: 'Swim class', color: '#fa8072', allDay: false, time: '9a' }
		]);
	});
});
