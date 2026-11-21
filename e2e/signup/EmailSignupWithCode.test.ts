import { test, expect } from '@playwright/test';
import { SignUpPage } from '../pageObjects/signup';
import {
	SESSION_COOKIE,
	createVerificationCode,
	db,
	eq,
	getAccount,
	getUser,
	teardownTestUser,
	users,
	type TestUser
} from '../testUtils';

let testUser: TestUser;

test.afterEach(async () => {
	if (testUser) {
		await teardownTestUser(testUser);
	}
});

test('Email Sign Up With Code', async ({ page }) => {
	const signUpPage = new SignUpPage(page);
	let verificationCode = '';
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
		verificationCode = await createVerificationCode(uniqueEmail, firstName, lastName, 'signup');
	});

	await test.step('Enter verification code and verify', async () => {
		await signUpPage.verificationInput.waitFor({ state: 'visible', timeout: 10000 });
		await signUpPage.verificationInput.fill(verificationCode);
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
		expect(account?.provider).toBe('email');

		const user = account ? await getUser(account.userId) : undefined;
		expect(user?.firstName).toBe(firstName);
		expect(user?.lastName).toBe(lastName);
		expect(user?.email).toBe(uniqueEmail);
		expect(user?.emailVerified).toBe(true);
	});

	await test.step('Verify that the user was logged In', async () => {
		const cookies = await page.context().cookies();
		const authCookie = cookies.find((e) => e.name === SESSION_COOKIE);
		expect(authCookie).not.toBeFalsy();
	});
});
