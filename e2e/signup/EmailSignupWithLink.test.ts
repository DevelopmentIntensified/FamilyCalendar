import { test, expect } from '@playwright/test';
import { SignUpPage } from '../pageObjects/signup';
import {
	SESSION_COOKIE,
	createVerificationCode,
	getAccount,
	getUser,
	teardownTestUser
} from '../testUtils';

const firstName = 'test';
const lastName = 'signupwithlink';
const email = 'delivered+signuplink' + Date.now() + '@resend.dev';

test.afterEach(async () => {
	await teardownTestUser({ email });
});

test('Email Sign Up With Link', async ({ page }) => {
	const signUpPage = new SignUpPage(page);
	let verificationCode = '';

	await test.step('Navigate to the page', async () => {
		await page.goto('/signup');
	});

	await test.step('Switch to Email Link mode and fill form', async () => {
		await signUpPage.emailModeButton.click();
		await signUpPage.firstNameInput.fill(firstName);
		await signUpPage.lastNameInput.fill(lastName);
		await signUpPage.emailInput.fill(email);
		await signUpPage.sendLinkButton.click();
		await page.waitForTimeout(2000);
	});

	await test.step('Create verification code in DB', async () => {
		verificationCode = await createVerificationCode(email, firstName, lastName, 'signup');
	});

	await test.step('Enter verification code and verify', async () => {
		await signUpPage.verificationInput.waitFor({ state: 'visible', timeout: 10000 });
		await signUpPage.verificationInput.fill(verificationCode);
		await signUpPage.verificationCodeButton.click();
		await page.waitForURL('/calendar', { timeout: 15000 });
	});

	await test.step('Verify that the user was created', async () => {
		const account = await getAccount(email);
		expect(account).not.toBeNull();
		expect(account?.provider).toBe('email');

		const user = account ? await getUser(account.userId) : undefined;
		expect(user?.firstName).toBe(firstName);
		expect(user?.lastName).toBe(lastName);
		expect(user?.email).toBe(email);
		expect(user?.emailVerified).toBe(true);
	});

	await test.step('Verify that the user was logged In', async () => {
		const cookies = await page.context().cookies();
		const authCookie = cookies.find((e) => e.name === SESSION_COOKIE);
		expect(authCookie).not.toBeFalsy();
	});
});
