import { test, expect } from '@playwright/test';
import { deleteAccount } from '../../src/lib/server/db/actions/accounts';
import { deleteUser } from '../../src/lib/server/db/actions/users';
import { deleteCodesByEmail, getCodesByEmail, createCode } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { calendars, users, sessions, userSettings, events } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { LoginPage } from '../pageObjects/login';
import { createNewUser } from '../../src/lib/server/utils/createNewUser';

const firstName = 'test';
const lastName = 'loginwithcode';
const email = `delivered+logincode${Date.now()}@resend.dev`;

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
		await db.delete(events).where(eq(events.ownerId, user[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, user[0].id));
		await db.delete(userSettings).where(eq(userSettings.userId, user[0].id));
		await db.delete(sessions).where(eq(sessions.userId, user[0].id));
		await deleteAccount(email);
		await deleteUser(uid);
		await deleteCodesByEmail(email);
	}
});

test('Email Login With Code', async ({ page }) => {
	const loginPage = new LoginPage(page);
	
	await test.step('Navigate to the page', async () => {
		await loginPage.goto();
	});

	await test.step('Switch to Email mode and enter email', async () => {
		await loginPage.emailModeButton.click();
		await loginPage.emailInput.fill(email);
		await loginPage.loginButton.click();
		await page.waitForTimeout(2000);
	});

	await test.step('Create verification code in DB (email sending mocked)', async () => {
		const uniqueCode = Math.random().toString(36).substring(2, 10).toUpperCase();
		await createCode({
			code: uniqueCode,
			expiresAt: new Date(Date.now() + 1000 * 60 * 15),
			email,
			firstName,
			lastName,
			emailId: 'test-email-id'
		});
	});

	await test.step('Enter verification code and login', async () => {
		await loginPage.verificationInput.waitFor({ state: 'visible', timeout: 10000 });
		const codes = await getCodesByEmail(email);
		await loginPage.verificationInput.fill(codes[0].code);
		await loginPage.verificationCodeButton.click();
		await page.waitForURL('/calendar', { timeout: 15000 });
	});

	await test.step('Verify that the user was logged In', async () => {
		const cookies = await page.context().cookies();
		const authCookie = cookies.find((e) => e.name === 'auth_session');
		expect(authCookie).not.toBeFalsy();
	});
});