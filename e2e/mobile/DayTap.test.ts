import { test, expect } from '../testUtils';
import { loginWithSession } from '../testUtils';
import { createEvent } from '../../src/lib/server/db/actions/events';
import { getUserCalendar } from '../../src/lib/server/db/actions/calendar';

function pad(n: number) {
	return String(n).padStart(2, '0');
}

test('mobile day tap: anywhere in a day cell (incl. event chips) opens the day action menu', async ({
	page,
	testUser
}) => {
	// Seed an event on today so a chip exists in the grid.
	const userCalendar = await getUserCalendar(testUser.uid);
	const now = new Date();
	if (now.getHours() + 3 > 23) {
		now.setHours(12, 0, 0, 0);
	}
	const start = new Date(now);
	start.setHours(start.getHours() + 2);
	const end = new Date(start);
	end.setHours(end.getHours() + 1);
	await createEvent(
		{
			title: 'Mobile Menu Event',
			start: start.toISOString(),
			end: end.toISOString(),
			location: 'Test Location',
			description: 'Test Description',
			calendarId: userCalendar.id,
			ownerId: testUser.uid
		},
		testUser.uid
	);

	await loginWithSession(page, testUser.email);
	await page.goto('/calendar');
	await page.waitForLoadState('networkidle');

	// Force the month grid (fresh users may default to day view).
	await page.getByRole('button', { name: 'Month' }).click();

	const todayLabel = `Open ${pad(start.getMonth() + 1)}-${pad(start.getDate())}-${start.getFullYear()}`;
	const dayCell = page.getByRole('button', { name: todayLabel });

	await test.step('Tapping directly on an event chip opens the day action menu (not the event detail)', async () => {
		const chip = dayCell.locator('..').locator('button', { hasText: 'Mobile Menu Event' }).first();
		const chipBox = await chip.boundingBox();
		if (!chipBox) throw new Error('chip not visible');
		await page.mouse.click(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2);

		const sheet = page.getByRole('dialog', { name: 'Day actions' });
		await expect(sheet).toBeVisible();
		await expect(sheet.getByText('Add event')).toBeVisible();
		await expect(sheet.getByText('Open Day Dashboard')).toBeVisible();
		await expect(sheet.getByText("View this day's events")).toBeVisible();
		await expect(sheet.getByText('Open Day View')).toBeVisible();
	});

	const expectedDate = start.toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric'
	});

	await test.step("'View this day's events' opens the events modal with a real formatted date", async () => {
		await page
			.getByRole('dialog', { name: 'Day actions' })
			.getByText("View this day's events")
			.click();

		const heading = page.getByRole('heading', { name: expectedDate });
		await expect(heading).toBeVisible();
		await expect(heading).not.toContainText('Invalid');
		await expect(page.locator('h3', { hasText: 'Mobile Menu Event' })).toBeVisible();
	});

	await test.step('Tapping a bare day cell (no events) also opens the menu', async () => {
		await page.getByRole('button', { name: 'Close' }).click();
		await expect(page.getByRole('heading', { name: expectedDate })).toBeHidden();

		const nextDay = new Date(start);
		nextDay.setDate(nextDay.getDate() + 1);
		const emptyLabel = `Open ${pad(nextDay.getMonth() + 1)}-${pad(nextDay.getDate())}-${nextDay.getFullYear()}`;
		const emptyCell = page.getByRole('button', { name: emptyLabel });
		await emptyCell.hover();
		const box = await emptyCell.boundingBox();
		if (!box) throw new Error('empty day cell not visible');
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		await expect(page.getByRole('dialog', { name: 'Day actions' })).toBeVisible();
	});
});
