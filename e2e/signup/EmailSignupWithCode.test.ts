import { test, expect } from '@playwright/test';
import { deleteAccount, getAccount } from '../../src/lib/server/db/actions/accounts';
import { deleteUserByEmail, getUser } from '../../src/lib/server/db/actions/users';
import { createCode, deleteCodesByEmail, getCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { users } from '../../src/lib/server/db/schema';
import { SignUpPage } from '../pageObjects/signup';
import { eq } from 'drizzle-orm';
import { teardownTestUser } from '../testUtils';
import type { TestUser } from '../testUtils';

let testUser: TestUser;

test.afterEach(async () => {
	if (testUser) {
		await teardownTestUser(testUser);
	}
});

test('Email Sign Up With Code', async ({ page }) => {
	const signUpPage = new SignUpPage(page);
	const uniqueEmail = `delivered+signupcode${Date.now()}@resend.dev`;
	const firstName = 'test';
	const lastName = 'signupcode';
	
	await test.step('Navigate to the page', async () => {
		await page.goto('/signup');
	});

	await test.step('Switch to Email Code mode and fill form', async () => {
		await signUpPage.emailModeButton.click();
		await signUpPage.firstNameInput.fill(firstName);
		await signUpPage.lastNameInput.fill(lastName);
		await signUpPage.emailInput.fill(uniqueEmail);
		await signUpPage.sendLinkButton.click();
		await page.waitForTimeout(2000);
	});

	await test.step('Create verification code in DB (email sending mocked)', async () => {
		const uniqueCode = Math.random().toString(36).substring(2, 10).toUpperCase();
		await createCode({
			code: uniqueCode,
			expiresAt: new Date(Date.now() + 1000 * 60 * 15),
			email: uniqueEmail,
			firstName,
			lastName,
			emailId: 'test-email-id'
		});
	});

	await test.step('Enter verification code and verify', async () => {
		await signUpPage.verificationInput.waitFor({ state: 'visible', timeout: 10000 });
		const codes = await getCodesByEmail(uniqueEmail);
		await signUpPage.verificationInput.fill(codes[0].code);
		await signUpPage.verificationCodeButton.click();
		await page.waitForURL('/calendar', { timeout: 15000 });
	});

	await test.step('Get user from DB', async () => {
		const userRecord = await db.select().from(users).where(eq(users.email, uniqueEmail));
		expect(userRecord[0]).toBeDefined();
		testUser = { 
			email: uniqueEmail, 
			firstName, 
			lastName, 
			uid: userRecord[0].id
		};
	});

	await test.step('Verify that the user was created', async () => {
		const account = await getAccount(uniqueEmail);
		expect(account).not.toBeNull();
		expect(account.provider).toBe('email');
		
		const user = await getUser(account.userId);
		expect(user.firstName).toBe(firstName);
		expect(user.lastName).toBe(lastName);
		expect(user.email).toBe(uniqueEmail);
		expect(user.emailVerified).toBe(true);
	});

	await test.step('Verify that the user was logged In', async () => {
		const cookies = await page.context().cookies();
		const authCookie = cookies.find((e) => e.name === 'auth_session');
		expect(authCookie).not.toBeFalsy();
	});
});