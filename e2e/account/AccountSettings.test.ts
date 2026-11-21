import { test, expect } from '@playwright/test';
import {
	authSession,
	createExtraSession,
	createNewUser,
	db,
	eq,
	getUser,
	loginWithSession,
	teardownTestUser
} from '../testUtils';

const firstName = 'test';
const lastName = 'accountsettings';
const email = `delivered+accountsettings${Date.now()}@resend.dev`;

let uid = '';

test.beforeEach(async () => {
	await teardownTestUser({ email });
	const user = await createNewUser(firstName, lastName, email);
	uid = user.id;
});

test.afterEach(async () => {
	await teardownTestUser({ email });
});

test('View account settings page', async ({ page }) => {
	await test.step('Login with session', async () => {
		await loginWithSession(page, email);
	});

	await test.step('Navigate to account settings', async () => {
		await page.goto('/account');
		await page.waitForLoadState('networkidle');
	});

	await test.step('Verify page title exists', async () => {
		await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible();
	});

	await test.step('Verify profile section is visible by default', async () => {
		await expect(page.locator('#profile')).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'First Name' })).toHaveValue(firstName);
		await expect(page.getByRole('textbox', { name: 'Last Name' })).toHaveValue(lastName);
	});

	await test.step('Verify email section is in sidebar', async () => {
		await expect(page.locator('nav').getByText('Email')).toBeVisible();
	});

	await test.step('Verify security section is in sidebar', async () => {
		await expect(page.locator('nav').getByText('Security')).toBeVisible();
	});

	await test.step('Verify danger zone section is in sidebar', async () => {
		await expect(page.locator('nav').getByText('Danger Zone')).toBeVisible();
	});
});

test('Logout from all devices removes other sessions', async ({ page }) => {
	await test.step('Login with session', async () => {
		await loginWithSession(page, email);
	});

	await test.step('Create additional sessions in DB', async () => {
		await createExtraSession(uid);
		await createExtraSession(uid);
	});

	await test.step('Verify multiple sessions exist', async () => {
		const allSessions = await db
			.select()
			.from(authSession)
			.where(eq(authSession.userId, uid));
		expect(allSessions.length).toBeGreaterThanOrEqual(3);
	});

	await test.step('Navigate to account settings', async () => {
		await page.goto('/account');
		await page.waitForLoadState('networkidle');
	});

	await test.step('Click on Security section in sidebar', async () => {
		await page.locator('nav').getByText('Security').click();
		await page.waitForTimeout(500);
	});

	await test.step('Click logout from all devices', async () => {
		await expect(page.locator('#security')).toBeVisible();
		await page.getByRole('button', { name: 'Logout from All Other Devices' }).click();
		await page.waitForTimeout(2000);
	});

	await test.step('Verify success message', async () => {
		const successMessage = page.locator('.bg-green-50');
		await expect(successMessage).toContainText('Logged out from all other devices');
	});

	await test.step('Verify only current session remains', async () => {
		const remainingSessions = await db
			.select()
			.from(authSession)
			.where(eq(authSession.userId, uid));
		expect(remainingSessions.length).toBe(1);
	});

	await test.step('Navigate to calendar to confirm still logged in', async () => {
		await page.goto('/calendar');
		await page.waitForURL('/calendar', { timeout: 15000 });
	});
});

test('Update profile saves changes', async ({ page }) => {
	await test.step('Login with session', async () => {
		await loginWithSession(page, email);
	});

	await test.step('Navigate to account settings', async () => {
		await page.goto('/account');
		await page.waitForLoadState('networkidle');
	});

	await test.step('Verify profile section is visible', async () => {
		await expect(page.locator('#profile')).toBeVisible();
	});

	await test.step('Update first name', async () => {
		const firstNameInput = page.getByRole('textbox', { name: 'First Name' });
		await firstNameInput.fill('UpdatedFirst');
		await page.getByRole('button', { name: 'Update Profile' }).click();
		await page.waitForTimeout(2000);
	});

	await test.step('Verify success message', async () => {
		const successMessage = page.locator('.bg-green-50');
		await expect(successMessage).toContainText('Profile updated successfully');
	});

	await test.step('Verify database was updated', async () => {
		const updatedUser = await getUser(uid);
		expect(updatedUser?.firstName).toBe('UpdatedFirst');
	});
});
