import { test, expect } from '@playwright/test';
import { deleteAccount } from '../../src/lib/server/db/actions/accounts';
import { deleteUser } from '../../src/lib/server/db/actions/users';
import { createCode, deleteCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { calendars, users, events } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createNewUser } from '../../src/lib/server/utils/createNewUser';
import { createEvent } from '../../src/lib/server/db/actions/events';
import { getUserCalendar } from '../../src/lib/server/db/actions/calendar';
import { getSessionCookie } from '../testUtils';

const firstName = 'test';
const lastName = 'eventdelete';
const email = 'eventdelete' + Date.now() + '@familyplanz.com';

let uid = '';
let eventId = '';

test.beforeEach(async () => {
	const existingUser = await db.select().from(users).where(eq(users.email, email));
	if (existingUser[0]) {
		await db.delete(events).where(eq(events.ownerId, existingUser[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, existingUser[0].id));
		await deleteAccount(email);
		await deleteUser(existingUser[0].id);
		await deleteCodesByEmail(email);
	}
	const user = await createNewUser(firstName, lastName, email);
	uid = user.id;
	const uniqueCode = Math.random().toString(36).substring(2, 10);
	await createCode({
		code: uniqueCode,
		expiresAt: new Date(Date.now() + 1000 * 60 * 15),
		email,
		firstName,
		lastName,
		emailId: null
	});

	const userCalendar = await getUserCalendar(uid);
	// A +2h/+3h offset run late at night spills into tomorrow, so the event
	// vanishes from the calendar's "today" view (fresh users default to day
	// view) and the test flakes after ~21:00. Clamp the base to noon so the
	// event always lands on today, mirroring EventCreation's local-date input.
	const now = new Date();
	if (now.getHours() + 3 > 23) {
		now.setHours(12, 0, 0, 0);
	}
	now.setHours(now.getHours() + 2);
	const end = new Date(now);
	end.setHours(end.getHours() + 1);

	const created = await createEvent({
		title: 'Event To Delete',
		start: now.toISOString(),
		end: end.toISOString(),
		location: 'Test Location',
		description: 'Test Description',
		calendarId: userCalendar.id,
		ownerId: uid
	});
	eventId = created.id;
});

test.afterEach(async () => {
	const user = await db.select().from(users).where(eq(users.email, email));
	if (user[0]) {
		await db.delete(events).where(eq(events.ownerId, user[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, user[0].id));
		await deleteAccount(email);
		await deleteUser(uid);
		await deleteCodesByEmail(email);
	}
});

test('Event Deletion', async ({ page }) => {
	await test.step('Setup session', async () => {
		const cookie = await getSessionCookie(email);
		await page.context().addCookies([{
			name: cookie.name,
			value: cookie.value,
			domain: 'localhost',
			path: '/',
			httpOnly: cookie.attributes.httpOnly,
			secure: cookie.attributes.secure,
			sameSite: 'Lax'
		}]);
	});

	await test.step('Open the event detail modal from the calendar', async () => {
		// The ?edit=<eventId> deep link 500s, so use the real user flow:
		// navigate to the calendar and click the event chip on the day grid.
		await page.goto('/calendar');
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Event To Delete' }).first().click();
		await expect(page.getByRole('button', { name: 'Delete event' })).toBeVisible();
	});

	await test.step('Click delete button', async () => {
		await page.getByRole('button', { name: 'Delete event' }).click();
		await expect(page.locator('text=Delete this event?')).toBeVisible();
	});

	await test.step('Confirm deletion', async () => {
		await page.locator('div.border-red-200 button:has-text("Delete")').click();
		// The modal closes once the delete API call succeeds and data refreshes.
		await expect(page.getByRole('button', { name: 'Delete event' })).not.toBeVisible();
	});

	await test.step('Verify event no longer appears', async () => {
		await expect(page.getByRole('button', { name: /Event To Delete/ })).not.toBeVisible();
	});

	await test.step('Verify event deleted from the database', async () => {
		const userEvents = await db.select().from(events).where(eq(events.ownerId, uid));
		expect(userEvents.some((e) => e.id === eventId)).toBe(false);
	});
});
