import type { Page, Locator } from '@playwright/test';

export class SignUpPage {
	page: Page;
	firstNameInput: Locator;
	lastNameInput: Locator;
	emailInput: Locator;
	signupButton: Locator;
	emailModeButton: Locator;
	sendLinkButton: Locator;
	verificationInput: Locator;
	verificationCodeButton: Locator;
	sendEmailAgainButton: Locator;
	constructor(page: Page) {
		this.page = page;
		this.firstNameInput = page.getByRole('textbox', { name: 'First Name' });
		this.lastNameInput = page.getByRole('textbox', { name: 'Last Name' });
		this.emailInput = this.page.getByRole('textbox', { name: 'Email' });
		this.signupButton = this.page.getByRole('button', { name: 'Create Account' });
		this.emailModeButton = this.page.getByRole('button', { name: 'Email Link' });
		this.sendLinkButton = this.page.getByRole('button', { name: 'Send Verification Link' });
		this.verificationInput = this.page.getByRole('textbox', { name: 'Enter verification code' });
		this.verificationCodeButton = this.page.getByRole('button', { name: 'Verify Code' });
		this.sendEmailAgainButton = this.page.getByRole('button', {
			name: 'Resend verification email'
		});
	}

	async goto() {
		await this.page.goto('/signup');
	}
}
