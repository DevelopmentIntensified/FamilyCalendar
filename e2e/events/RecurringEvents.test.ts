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
const lastName = 'recurring';
const email = 'recurring' + Date.now() + '@familyplanz.com';

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

async function login(page: any) {
	const cookie = await getSessionCookie(email);
	await page.context().addCookies([
		{
			name: cookie.name,
			value: cookie.value,
			domain: 'localhost',
			path: '/',
			httpOnly: cookie.attributes.httpOnly,
			secure: cookie.attributes.secure,
			sameSite: 'Lax'
		}
	]);
}

test('Weekly repeating events expand and duplicates keep repeating', async ({ page }) => {
	await login(page);

	// Create a weekly event via the API (same shape the form submits).
	const today = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	const localDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
	const createResp = await page.request.post('/api/events', {
		data: {
			title: 'Standup Weekly',
			start: `${localDate}T10:00:00`,
			end: `${localDate}T11:00:00`,
			allDay: false,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1
		}
	});
	expect(createResp.ok()).toBe(true);

	// The master persists the recurrence fields.
	const rows = await db.select().from(events).where(eq(events.ownerId, uid));
	expect(rows).toHaveLength(1);
	expect(rows[0].recurrenceFrequency).toBe('weekly');

	// The series expands: the title renders on multiple days (month view).
	await page.goto('/calendar?view=month');
	await page.waitForLoadState('networkidle');
	await expect(page.locator('button[title="Standup Weekly"]').first()).toBeVisible();
	expect
		.poll(async () => page.locator('button[title="Standup Weekly"]').count(), {
			timeout: 10_000
		})
		.toBeGreaterThan(1);

	// Duplicate the first occurrence; the copy must repeat too.
	await page.locator('button[title="Standup Weekly"]').first().click();
	await page.getByRole('button', { name: 'Duplicate event' }).click();
	await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
	await page.waitForResponse(
		(r) => r.url().includes('/api/events') && r.request().method() === 'POST'
	);

	// The copy must repeat too. Wait for the revalidated data to land
	// (invalidateAll refetch can outlive 'networkidle').
	await expect(page.locator('button[title="Standup Weekly (copy)"]').first()).toBeVisible();
	expect
		.poll(async () => page.locator('button[title="Standup Weekly (copy)"]').count(), {
			timeout: 10_000
		})
		.toBeGreaterThan(1);

	const copyRows = await db
		.select()
		.from(events)
		.where(eq(events.ownerId, uid));
	expect(copyRows).toHaveLength(2);
	expect(copyRows[1].recurrenceFrequency).toBe('weekly');
});
