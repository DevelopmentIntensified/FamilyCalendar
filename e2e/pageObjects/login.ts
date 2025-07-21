import { Locator, Page } from '@playwright/test';

export class LoginPage {
	page: Page;
	emailInput: Locator;
	signupButton: Locator;
	verificationInput: Locator;
	verificationCodeButton: Locator;
	sendEmailAgainButton: Locator;
	constructor(page: Page) {
		this.page = page;
		this.emailInput = this.page.getByRole('textbox', { name: 'Email' });
		this.signupButton = this.page.getByRole('button', { name: 'Login' });
		this.verificationInput = this.page.getByRole('textbox', { name: 'Enter verification code' });
		this.verificationCodeButton = this.page.getByRole('button', { name: 'Verify Code' });
		this.sendEmailAgainButton = this.page.getByRole('button', {
			name: 'Resend verification email'
		});
	}

	async goto() {
		await this.page.goto('/login');
	}
}
