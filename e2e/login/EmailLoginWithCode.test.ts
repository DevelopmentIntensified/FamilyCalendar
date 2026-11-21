import { test, expect } from '@playwright/test';
import { LoginPage } from '../pageObjects/login';
import {
	SESSION_COOKIE,
	createNewUser,
	createVerificationCode,
	teardownTestUser
} from '../testUtils';

const firstName = 'test';
const lastName = 'loginwithcode';
const email = `delivered+logincode${Date.now()}@resend.dev`;

let uid = '';

test.beforeEach(async () => {
	await teardownTestUser({ email });
	const user = await createNewUser(firstName, lastName, email);
	uid = user.id;
});

test.afterEach(async () => {
	await teardownTestUser({ email });
});

test('Email Login With Code', async ({ page }) => {
	const loginPage = new LoginPage(page);
	let verificationCode = '';

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
		verificationCode = await createVerificationCode(email, firstName, lastName, 'login');
	});

	await test.step('Enter verification code and login', async () => {
		await loginPage.verificationInput.waitFor({ state: 'visible', timeout: 10000 });
		await loginPage.verificationInput.fill(verificationCode);
		await loginPage.verificationCodeButton.click();
		await page.waitForURL('/calendar', { timeout: 15000 });
	});

	await test.step('Verify that the user was logged In', async () => {
		const cookies = await page.context().cookies();
		const authCookie = cookies.find((e) => e.name === SESSION_COOKIE);
		expect(authCookie).not.toBeFalsy();
	});
});
