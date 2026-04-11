import { test, expect } from '@playwright/test';
import { SignUpPage } from '../pageObjects/signup';

const firstName = 'test';
const lastName = 'invalidemail';

const invalidEmails = ['notanemail', 'test@', 'test.com'];

for (const email of invalidEmails) {
	test(`Email Sign Up With Invalid Email: ${email}`, async ({ page }) => {
		const signUpPage = new SignUpPage(page);
		await test.step('Navigate to the page', async () => {
			await page.goto('/signup');
		});

		await test.step('Fill form with invalid email and submit', async () => {
			await signUpPage.firstNameInput.fill(firstName);
			await signUpPage.lastNameInput.fill(lastName);
			await signUpPage.emailInput.fill(email);
			await signUpPage.signupButton.click();
		});

		await test.step('Expect validation error or form does not submit', async () => {
			await page.waitForTimeout(1000);
			const currentUrl = page.url();
			expect(currentUrl).toContain('/signup');
		});
	});
}