import { test, expect } from '@playwright/test';

test.describe('Contact Page', () => {
	test('Contact page loads correctly', async ({ page }) => {
		await page.goto('/contact');
		await expect(page.locator('h1')).toContainText(/Contact/i);
		await expect(page.locator('input[name="name"]')).toBeVisible();
		await expect(page.locator('input[name="email"]')).toBeVisible();
		await expect(page.locator('textarea[name="message"]')).toBeVisible();
		await expect(page.locator('button[type="submit"]')).toBeVisible();
	});

	test('Contact form requires name, email, and message fields', async ({ page }) => {
		await page.goto('/contact');
		await page.click('button[type="submit"]');
		await expect(page.locator('input[name="name"]')).toHaveAttribute('required');
		await expect(page.locator('input[name="email"]')).toHaveAttribute('required');
		await expect(page.locator('textarea[name="message"]')).toHaveAttribute('required');
	});

	test('Contact form validates email format', async ({ page }) => {
		await page.goto('/contact');
		await page.fill('input[name="name"]', 'Test User');
		await page.fill('input[name="email"]', 'invalid-email');
		await page.fill('textarea[name="message"]', 'Test message');
		await page.click('button[type="submit"]');
		await expect(page.locator('input[name="email"]')).toHaveAttribute('type', 'email');
	});

	test('Contact form has honeypot field for spam protection', async ({ page }) => {
		await page.goto('/contact');
		await expect(page.locator('input[name="website"]')).toHaveAttribute('tabindex', '-1');
		await expect(page.locator('input[name="website"]')).toHaveAttribute('aria-hidden', 'true');
	});

	test('Contact page displays contact information', async ({ page }) => {
		await page.goto('/contact');
		await expect(page.locator('text=hello@familyplanz.com')).toBeVisible();
		await expect(page.locator('text=United States')).toBeVisible();
		await expect(page.locator('text=Mon-Fri')).toBeVisible();
	});
});
