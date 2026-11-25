import { test, expect } from '@playwright/test';
import { createNewUser, loginWithSession, teardownTestUser } from '../testUtils';

const testEmail = `delivered+settings${Date.now()}@resend.dev`;

test.beforeEach(async () => {
	await teardownTestUser({ email: testEmail });
	await createNewUser('test', 'settings', testEmail);
});

test.afterEach(async () => {
	await teardownTestUser({ email: testEmail });
});

test.describe('Settings Page - Profile', () => {
	test.beforeEach(async ({ page }) => {
		await loginWithSession(page, testEmail);
		await page.goto('/account');
		await page.waitForLoadState('networkidle');
	});

	test('displays profile section with name fields', async ({ page }) => {
		await expect(page.locator('h1:has-text("Account Settings")')).toBeVisible();
		await expect(page.getByLabel('First Name')).toBeVisible();
		await expect(page.getByLabel('Last Name')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Update Profile' })).toBeVisible();
	});

	test('profile fields prefilled with user info', async ({ page }) => {
		await expect(page.getByLabel('First Name')).toHaveValue('test');
		await expect(page.getByLabel('Last Name')).toHaveValue('settings');
	});
});

test.describe('Settings Page - Calendar Settings', () => {
	test.beforeEach(async ({ page }) => {
		await loginWithSession(page, testEmail);
		await page.goto('/account');
		await page.waitForLoadState('networkidle');
		await page.locator('a[href="#calendar"]').click();
		await expect(page.getByRole('heading', { name: 'Calendar Settings' })).toBeVisible();
	});

	test('displays calendar settings section', async ({ page }) => {
		await expect(page.getByLabel('Week Starts On')).toBeVisible();
		await expect(page.getByLabel('Time Zone')).toBeVisible();
		await expect(page.getByLabel('Default View')).toBeVisible();
		await expect(page.getByLabel('Default Calendar')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Save Calendar Settings' })).toBeVisible();
	});

	test('shows smart event creation toggle', async ({ page }) => {
		await expect(page.locator('input[name="autoParseEventDetails"]')).toBeVisible();
	});

	test('shows dashboard module toggles', async ({ page }) => {
		// #105 split the switches into their own Dashboard section on legacy; the spec never followed.
		await page.locator('a[href="#dashboard"]').click();
		// Legacy also renders a "Save Dashboard Modules" button, so the bare text locator matched twice.
		await expect(page.getByRole('heading', { name: 'Dashboard modules' })).toBeVisible();
		await expect(page.locator('input[name="module_verse"]')).toBeVisible();
		await expect(page.locator('input[name="module_glance"]')).toBeVisible();
	});
});

test.describe('Settings Page - Subscription', () => {
	test.beforeEach(async ({ page }) => {
		await loginWithSession(page, testEmail);
		await page.goto('/account');
		await page.waitForLoadState('networkidle');
		await page.locator('a[href="#subscription"]').click();
		await expect(page.locator('#subscription')).toBeVisible();
	});

	test('shows current plan', async ({ page }) => {
		await expect(page.locator('text=Current Plan')).toBeVisible();
		await expect(page.locator("text=You're on the Free plan.")).toBeVisible();
	});

	test('shows family master upgrade section with pricing link', async ({ page }) => {
		await expect(page.locator('text=Family Master')).toBeVisible();
		await expect(page.locator('a[href="/pricing"]')).toBeVisible();
	});
});
