import { test, expect } from '@playwright/test';
import { deleteAccount } from '../../src/lib/server/db/actions/accounts';
import { deleteUser, getUser } from '../../src/lib/server/db/actions/users';
import { deleteCodesByEmail, getCodesByEmail, createCode } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { calendars, users, sessions, userSettings, events } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createNewUser } from '../../src/lib/server/utils/createNewUser';
import { LoginPage } from '../pageObjects/login';

const firstName = 'test';
const lastName = 'profileedit';
const email = `delivered+profileedit${Date.now()}@resend.dev`;

let uid = '';

test.beforeEach(async () => {
	const existingUser = await db.select().from(users).where(eq(users.email, email));
	if (existingUser[0]) {
		await db.delete(events).where(eq(events.ownerId, existingUser[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, existingUser[0].id));
		await db.delete(userSettings).where(eq(userSettings.userId, existingUser[0].id));
		await db.delete(sessions).where(eq(sessions.userId, existingUser[0].id));
		await deleteAccount(email);
		await deleteUser(existingUser[0].id);
		await deleteCodesByEmail(email);
	}
	let user = await createNewUser(firstName, lastName, email);
	uid = user.id;
});

test.afterEach(async () => {
	const user = await db.select().from(users).where(eq(users.email, email));
	if (user[0]) {
		await db.delete(calendars).where(eq(calendars.ownerId, user[0].id));
		await db.delete(userSettings).where(eq(userSettings.userId, user[0].id));
		await db.delete(sessions).where(eq(sessions.userId, user[0].id));
		await deleteAccount(email);
		await deleteUser(uid);
		await deleteCodesByEmail(email);
	}
});

async function loginAndNavigateToAccount(page: import('@playwright/test').Page) {
	const loginPage = new LoginPage(page);
	await loginPage.goto();
	await loginPage.emailModeButton.click();
	await loginPage.emailInput.fill(email);
	await loginPage.loginButton.click();
	await page.waitForTimeout(2000);

	const uniqueCode = Math.random().toString(36).substring(2, 10).toUpperCase();
	await createCode({
		code: uniqueCode,
		expiresAt: new Date(Date.now() + 1000 * 60 * 15),
		email,
		firstName,
		lastName,
		emailId: 'test-email-id'
	});

	const codes = await getCodesByEmail(email);
	await loginPage.verificationInput.fill(codes[0].code);
	await loginPage.verificationCodeButton.click();
	await page.waitForURL('/calendar', { timeout: 15000 });

	await page.getByRole('link', { name: 'Account', exact: true }).click();
	await page.waitForURL('/account', { timeout: 15000 });
}

test('View profile info', async ({ page }) => {
	await test.step('Login and navigate to account page', async () => {
		await loginAndNavigateToAccount(page);
	});

	await test.step('Verify profile info is displayed', async () => {
		await expect(page.getByRole('textbox', { name: 'First Name' })).toHaveValue(firstName);
		await expect(page.getByRole('textbox', { name: 'Last Name' })).toHaveValue(lastName);
		await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue(email);
	});
});

test('Edit name fields', async ({ page }) => {
	await test.step('Login and navigate to account page', async () => {
		await loginAndNavigateToAccount(page);
	});

	await test.step('Edit name fields', async () => {
		await page.getByRole('textbox', { name: 'First Name' }).fill('UpdatedFirst');
		await page.getByRole('textbox', { name: 'Last Name' }).fill('UpdatedLast');
		await page.getByRole('button', { name: 'Update Profile' }).click();
		await page.waitForTimeout(2000);
	});

	await test.step('Verify success message', async () => {
		const successMessage = page.locator('.bg-green-50');
		await expect(successMessage).toContainText('Profile updated successfully');
	});
});

test('Save changes and verify via DB query', async ({ page }) => {
	await test.step('Login and navigate to account page', async () => {
		await loginAndNavigateToAccount(page);
	});

	await test.step('Verify initial name in DB', async () => {
		const user = await getUser(uid);
		expect(user?.firstName).toBe(firstName);
		expect(user?.lastName).toBe(lastName);
	});

	await test.step('Update name in form', async () => {
		await page.getByRole('textbox', { name: 'First Name' }).fill('NewFirstName');
		await page.getByRole('textbox', { name: 'Last Name' }).fill('NewLastName');
		await page.getByRole('button', { name: 'Update Profile' }).click();
		await page.waitForTimeout(2000);
	});

	await test.step('Verify changes via DB query', async () => {
		const updatedUser = await getUser(uid);
		expect(updatedUser?.firstName).toBe('NewFirstName');
		expect(updatedUser?.lastName).toBe('NewLastName');
	});

	await test.step('Verify form shows updated values', async () => {
		await expect(page.getByRole('textbox', { name: 'First Name' })).toHaveValue('NewFirstName');
		await expect(page.getByRole('textbox', { name: 'Last Name' })).toHaveValue('NewLastName');
	});
});