import { test, expect } from '@playwright/test';
import { deleteAccount } from '../../src/lib/server/db/actions/accounts';
import { deleteUser } from '../../src/lib/server/db/actions/users';
import { createCode, deleteCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { calendars, users, events, tasks } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createNewUser } from '../../src/lib/server/utils/createNewUser';
import { getSessionCookie } from '../testUtils';

const firstName = 'test';
const lastName = 'recurwins';
const email = 'recurwins' + Date.now() + '@familyplanz.com';

let uid = '';

test.beforeEach(async () => {
	const existingUser = await db.select().from(users).where(eq(users.email, email));
	if (existingUser[0]) {
		await db.delete(events).where(eq(events.ownerId, existingUser[0].id));
		await db.delete(tasks).where(eq(tasks.userId, existingUser[0].id));
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
		await db.delete(tasks).where(eq(tasks.userId, uid));
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

test('Recurring task completions count towards today`s wins', async ({ page }) => {
	await login(page);

	// Create a weekly recurring task due today.
	const today = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	const localDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
	const createResp = await page.request.post('/api/tasks', {
		data: {
			title: 'Water the plants',
			dueDate: `${localDate}T08:00:00`,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1
		}
	});
	expect(createResp.ok()).toBe(true);
	const { task } = (await createResp.json()) as { task: { id: string } };

	// Check it off: the cursor rolls forward, completedAt stays null.
	const toggleResp = await page.request.put(`/api/tasks/${task.id}`, {
		data: { toggleComplete: true }
	});
	expect(toggleResp.ok()).toBe(true);

	// The completion is recorded in history (drives streak + wins) while the
	// task row itself stays open for the next occurrence.
	const [taskRow] = await db.select().from(tasks).where(eq(tasks.id, task.id));
	expect(taskRow.completedAt).toBeNull();
	expect(taskRow.completionCount).toBe(1);

	// The day dashboard's "Completed today" card must count that win.
	await page.goto('/calendar/dashboard');
	await page.waitForLoadState('networkidle');
	const card = page.locator('section[aria-label="Completed today"]');
	await expect(card).toBeVisible();
	await expect(card.getByText('Water the plants')).toBeVisible();
	await expect(card.getByText('win', { exact: true })).toBeVisible();
});