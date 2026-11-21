import { test, expect } from '@playwright/test';
import {
	accounts,
	authSession,
	calendars,
	codes,
	createNewUser,
	db,
	eq,
	events,
	getUser,
	loginWithSession,
	teardownTestUser,
	userSettings
} from '../testUtils';

const firstName = 'test';
const lastName = 'delete';
const email = `delivered+delete${Date.now()}@resend.dev`;

let uid = '';

test.beforeEach(async () => {
	await teardownTestUser({ email });
	const user = await createNewUser(firstName, lastName, email);
	uid = user.id;
	await db.delete(codes).where(eq(codes.email, email));
});

test.afterEach(async () => {
	await teardownTestUser({ email });
});

test('Account deletion removes user and all related data', async ({ page }) => {
	test.setTimeout(60000);
	await test.step('Login with session', async () => {
		await loginWithSession(page, email);
	});

	await test.step('Navigate to account page', async () => {
		await page.goto('/account');
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(1000);
	});

	await test.step('Click delete account button', async () => {
		await page.evaluate(() => (window.location.hash = '#danger'));
		await page.waitForTimeout(500);
		const deleteButton = page.getByRole('button', { name: 'Delete Account' });
		await expect(deleteButton).toBeVisible({ timeout: 10000 });
		await deleteButton.click();
	});

	await test.step('Confirm deletion with user ID', async () => {
		const confirmationInput = page.getByRole('textbox', { name: 'Confirmation' });
		await expect(confirmationInput).toBeVisible({ timeout: 10000 });
		await confirmationInput.fill(uid);
		await confirmationInput.dispatchEvent('input');

		const confirmButton = page.getByRole('button', { name: 'Confirm Deletion' });
		await confirmButton.click();

		await page.waitForTimeout(5000);
	});

	await test.step('Verify user is deleted from DB', async () => {
		const deletedUser = await getUser(uid);
		expect(deletedUser).toBeUndefined();
	});

	await test.step('Verify related data is cleaned up', async () => {
		const relatedSessions = await db
			.select()
			.from(authSession)
			.where(eq(authSession.userId, uid));
		expect(relatedSessions).toHaveLength(0);

		const relatedAccounts = await db.select().from(accounts).where(eq(accounts.userId, uid));
		expect(relatedAccounts).toHaveLength(0);

		const relatedUserSettings = await db
			.select()
			.from(userSettings)
			.where(eq(userSettings.userId, uid));
		expect(relatedUserSettings).toHaveLength(0);

		const relatedCalendars = await db.select().from(calendars).where(eq(calendars.ownerId, uid));
		expect(relatedCalendars).toHaveLength(0);

		const relatedEvents = await db.select().from(events).where(eq(events.ownerId, uid));
		expect(relatedEvents).toHaveLength(0);
	});
});

test('Account deletion redirects to home page', async ({ page }) => {
	test.setTimeout(60000);
	await test.step('Login with session', async () => {
		await loginWithSession(page, email);
	});

	await test.step('Navigate to account page and delete', async () => {
		await page.goto('/account');
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(1000);

		await page.evaluate(() => (window.location.hash = '#danger'));
		await page.waitForTimeout(500);

		const deleteButton = page.getByRole('button', { name: 'Delete Account' });
		await expect(deleteButton).toBeVisible({ timeout: 10000 });
		await deleteButton.click();

		const confirmationInput = page.getByRole('textbox', { name: 'Confirmation' });
		await expect(confirmationInput).toBeVisible({ timeout: 10000 });
		await confirmationInput.fill(uid);

		await page.getByRole('button', { name: 'Confirm Deletion' }).click();
	});

	await test.step('Verify redirect to home', async () => {
		await expect(page).toHaveURL('/', { timeout: 30000 });
	});
});
