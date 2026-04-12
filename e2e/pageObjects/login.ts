import type { Locator, Page } from '@playwright/test';

export class LoginPage {
	page: Page;
	emailInput: Locator;
	loginButton: Locator;
	emailModeButton: Locator;
	verificationInput: Locator;
	verificationCodeButton: Locator;
	sendEmailAgainButton: Locator;
	constructor(page: Page) {
		this.page = page;
		this.emailInput = this.page.getByRole('textbox', { name: 'Email' });
		this.loginButton = this.page.getByRole('button', { name: 'Login' });
		this.emailModeButton = this.page.getByRole('button', { name: 'Email Link' });
		this.verificationInput = this.page.getByRole('textbox', { name: 'Enter login code' });
		this.verificationCodeButton = this.page.getByRole('button', { name: 'Login' });
		this.sendEmailAgainButton = this.page.getByRole('button', {
			name: 'Resend verification email'
		});
	}

	async goto() {
		await this.page.goto('/login');
	}
}
