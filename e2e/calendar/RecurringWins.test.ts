import { test, expect, type Page } from '@playwright/test';
import {
	createNewUser,
	db,
	eq,
	getSessionCookie,
	teardownTestUser,
	tasks
} from '../testUtils';

const firstName = 'test';
const lastName = 'recurwins';
const email = 'recurwins' + Date.now() + '@familyplanz.com';

let uid = '';

test.beforeEach(async () => {
	await teardownTestUser({ email });
	const user = await createNewUser(firstName, lastName, email);
	uid = user.id;
});

test.afterEach(async () => {
	await teardownTestUser({ email });
});

async function login(page: Page) {
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
	// SAFETY: the /api/tasks POST contract returns { task: { id } }; shape asserted right after ok() check.
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
