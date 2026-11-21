import { test, expect } from '@playwright/test';
import {
	createNewUser,
	createVerificationCode,
	getCodesByEmail,
	getUser,
	loginWithSession,
	teardownTestUser
} from '../testUtils';

const firstName = 'test';
const lastName = 'emailchange';
const email = `delivered+emailchange${Date.now()}@resend.dev`;
const newEmail = `delivered+newemailchange${Date.now()}@resend.dev`;

let uid = '';

test.beforeEach(async () => {
	await teardownTestUser({ email });
	const user = await createNewUser(firstName, lastName, email);
	uid = user.id;
});

test.afterEach(async () => {
	await teardownTestUser({ email });
});

test('Email change triggers verification email', async ({ page }) => {
	test.setTimeout(60000);
	await test.step('Login with session', async () => {
		await loginWithSession(page, email);
	});

	await test.step('Navigate to account page', async () => {
		await page.goto('/account#email');
		await page.waitForLoadState('networkidle');
	});

	await test.step('Click on Email section in sidebar', async () => {
		await page.evaluate(() => (window.location.hash = '#email'));
		await page.waitForTimeout(1000);
	});

	await test.step('Change email', async () => {
		await expect(page.locator('input#email')).toBeVisible({ timeout: 10000 });
		const emailInput = page.locator('input#email');
		await emailInput.click();
		await emailInput.fill(newEmail);

		const updateButton = page.getByRole('button', { name: 'Update Email' });
		await expect(updateButton).toBeEnabled({ timeout: 5000 });
		await updateButton.click();

		await page.waitForTimeout(3000);
	});

	await test.step('Verify verification code was created in DB', async () => {
		const codes = await getCodesByEmail(email);
		const emailChangeCode = codes.find(
			(c) => c.type === 'email_change' && c.pendingEmail === newEmail
		);
		expect(emailChangeCode).toBeDefined();
		// Q-116/Q-117: the row holds HMAC-SHA-256(EMAILSECRET, code), never the
		// 8-character plaintext the person received.
		expect(emailChangeCode?.code).toMatch(/^[0-9a-f]{64}$/);
	});

	await test.step('Verify success message', async () => {
		const successMessage = page.locator('.bg-green-50');
		await expect(successMessage).toBeVisible({ timeout: 10000 });
	});
});

test('Verification link updates email', async ({ page }) => {
	test.setTimeout(60000);
	await test.step('Login with session', async () => {
		await loginWithSession(page, email);
	});

	await test.step('Navigate to account page', async () => {
		await page.goto('/account#email');
		await page.waitForLoadState('networkidle');
	});

	await test.step('Click on Email section and change email', async () => {
		await page.evaluate(() => (window.location.hash = '#email'));
		await page.waitForTimeout(1000);

		await expect(page.locator('input#email')).toBeVisible({ timeout: 10000 });
		const emailInput = page.locator('input#email');
		await emailInput.click();
		await emailInput.fill(newEmail);

		const updateButton = page.getByRole('button', { name: 'Update Email' });
		await expect(updateButton).toBeEnabled({ timeout: 5000 });
		await updateButton.click();

		await page.waitForTimeout(3000);
	});

	await test.step('Get verification code for the pending change', async () => {
		// The app mailed its own code (mail is not observed in e2e) and the
		// database keeps only its digest, so the journey mints a code for the
		// same pending change and carries its plaintext to the form.
		const changeCode = await createVerificationCode(
			email,
			firstName,
			lastName,
			'email_change',
			newEmail
		);

		await test.step('Navigate to verify-email page with code', async () => {
			await page.goto(`/account/verify-email?code=${changeCode}`);
		});

		await test.step('Submit verification', async () => {
			await page.getByPlaceholder('Enter the 8-digit code').fill(changeCode);
			const verifyButton = page.getByRole('button', { name: 'Verify' });
			await verifyButton.click();
			await page.waitForTimeout(2000);

			const successMessage = page.locator('.bg-green-100');
			await expect(successMessage).toContainText('Email verified successfully');
		});

		await test.step('Verify email was updated', async () => {
			const updatedUser = await getUser(uid);
			expect(updatedUser?.email).toBe(newEmail);
			expect(updatedUser?.emailVerified).toBe(true);
		});
	});
});
