import { test, expect } from './../testUtils';
import { loginWithSession } from '../testUtils';

test('mobile smoke: bottom nav, alerts, and task quick-add', async ({ page, testUser }) => {
	await loginWithSession(page, testUser.email);

	await test.step('BottomNav shows 5 tabs on calendar', async () => {
		await page.goto('/calendar');
		await page.waitForLoadState('networkidle');

		const nav = page.locator('nav[aria-label="Primary navigation"]');
		await expect(nav).toBeVisible();
		await expect(nav.getByText('Calendar')).toBeVisible();
		await expect(nav.getByText('Dashboard')).toBeVisible();
		await expect(nav.getByText('Tasks')).toBeVisible();
		await expect(nav.getByText('Alerts')).toBeVisible();
		await expect(nav.getByText('Family')).toBeVisible();
	});

	await test.step('Alerts tab navigates to notifications', async () => {
		await page.locator('nav[aria-label="Primary navigation"] a[href="/calendar/notifications"]').click();
		await expect(page).toHaveURL(/\/calendar\/notifications/);
	});

	await test.step('Add a task via quick-add input', async () => {
		await page.goto('/calendar/tasks');
		await page.waitForLoadState('networkidle');

		const quickAdd = page.locator('input[placeholder="Add a task..."]');
		await expect(quickAdd).toBeVisible();
		await quickAdd.fill('Buy groceries');
		await quickAdd.press('Enter');

		const row = page.getByText('Buy groceries');
		await expect(row).toBeVisible();
	});

	await test.step('Delete and toggle buttons are visible without hover on touch', async () => {
		const toggle = page.locator('button[aria-label="Complete task"]');
		const deleteBtn = page.locator('button[aria-label="Delete task"]');
		await expect(toggle).toBeVisible();
		await expect(deleteBtn).toBeVisible();
	});

	await test.step('Toggle the task complete', async () => {
		await page.locator('button[aria-label="Complete task"]').click();
		await expect(page.locator('button[aria-label="Mark incomplete"]')).toBeVisible();
	});
});
