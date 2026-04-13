import { test, expect } from '@playwright/test';
import { deleteAccount } from '../../src/lib/server/db/actions/accounts';
import { deleteUser } from '../../src/lib/server/db/actions/users';
import { createCode, deleteCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { calendars, users, events } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { EventPage } from '../pageObjects/event';
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
	let user = await createNewUser(firstName, lastName, email);
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
	const now = new Date();
	now.setHours(now.getHours() + 2);
	const end = new Date();
	end.setHours(end.getHours() + 3);

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
	const eventPage = new EventPage(page);

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

	await test.step('Navigate to event page', async () => {
		await page.goto('/calendar');
		await page.click(`a[href="/calendar/event/${eventId}"]`);
		await page.waitForLoadState('networkidle');
	});

	await test.step('Click delete button', async () => {
		await eventPage.deleteButton.click();
	});

	await test.step('Confirm deletion', async () => {
		await eventPage.confirmDeleteButton.click();
		await page.waitForURL('/calendar', { timeout: 15000 });
	});

	await test.step('Verify event no longer appears', async () => {
		await expect(page.getByText('Event To Delete')).not.toBeVisible();
	});
});