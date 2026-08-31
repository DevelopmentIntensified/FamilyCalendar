import { test, expect } from '@playwright/test';
import { deleteAccount } from '../../src/lib/server/db/actions/accounts';
import { deleteUser } from '../../src/lib/server/db/actions/users';
import { createCode, deleteCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { calendars, users, events } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createNewUser } from '../../src/lib/server/utils/createNewUser';
import { getSessionCookie } from '../testUtils';

const firstName = 'test';
const lastName = 'eventcreation';
const email = 'eventcreation' + Date.now() + '@familyplanz.com';

let uid = '';

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

test('Event Creation', async ({ page }) => {
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

	await test.step('Navigate to calendar and open the Quick Add modal', async () => {
		await page.goto('/calendar');
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Quick Add Event' }).click();
		await expect(page.getByText('New Event')).toBeVisible();
	});

	await test.step('Fill out event form', async () => {
		await page.fill('#event-title', 'Test Event');
		// Reveal the date field (hidden behind "Show More" until parsing or expand)
		await page.getByRole('button', { name: 'Show More' }).click();
		// Local-date string (not toISOString, which shifts a late-evening local
		// date into the next UTC day and out of the current month grid view).
		const today = new Date();
		const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
			today.getDate()
		).padStart(2, '0')}`;
		await page.fill('#event-date', localDate);
	});

	await test.step('Submit form', async () => {
		await page.click('button[type="submit"]:has-text("Create")');
		// The modal closes once the server action completes — this is the real
		// signal that creation finished (we never navigate away from /calendar).
		await expect(page.getByText('New Event')).not.toBeVisible({ timeout: 15000 });
	});

	await test.step('Verify event was created in the database', async () => {
		const userEvents = await db.select().from(events).where(eq(events.ownerId, uid));
		expect(userEvents.length).toBeGreaterThan(0);
		expect(userEvents[0].title).toBe('Test Event');
	});

	await test.step('Verify event appears on calendar', async () => {
		// Today's event renders as a chip in the current month's day grid.
		await expect(page.getByRole('button', { name: 'Test Event' }).first()).toBeVisible();
	});
});
