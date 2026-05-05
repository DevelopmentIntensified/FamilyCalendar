import { test, expect } from '@playwright/test';

test.describe('Waitlist Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/waitlist');
	});

	test('waitlist page loads correctly', async ({ page }) => {
		await expect(page.locator('h1')).toContainText('Join the Waitlist');
	});

	test('page displays early access badge', async ({ page }) => {
		await expect(page.locator('span:has-text("Early Access")').first()).toBeVisible();
	});

	test('form renders with name field', async ({ page }) => {
		const nameInput = page.locator('input[name="name"]');
		await expect(nameInput).toBeVisible();
		await expect(page.locator('label[for="name"]')).toContainText('Full Name');
	});

	test('form renders with email field', async ({ page }) => {
		const emailInput = page.locator('input[name="email"]');
		await expect(emailInput).toBeVisible();
		await expect(page.locator('label[for="email"]')).toContainText('Email Address');
	});

	test('form has submit button', async ({ page }) => {
		const submitButton = page.locator('button[type="submit"]');
		await expect(submitButton).toContainText('Join the Waitlist');
	});

	test('form shows why join section', async ({ page }) => {
		await expect(page.locator('h2:has-text("Why join the waitlist?")')).toBeVisible();
		await expect(page.locator('text=Early access to Family Master')).toBeVisible();
		await expect(page.locator('text=Exclusive launch pricing')).toBeVisible();
	});

	test.describe('privacy link', () => {
		test('has privacy policy link', async ({ page }) => {
			const privacyLink = page.locator('a[href="/privacy"]');
			await expect(privacyLink).toContainText('Privacy Policy');
		});
	});
});