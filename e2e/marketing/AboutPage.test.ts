import { test, expect } from '@playwright/test';

test.describe('About Page', () => {
	test('About page loads correctly', async ({ page }) => {
		await page.goto('/about');
		await expect(page.locator('h1')).toContainText(/About/i);
	});

	test('About page displays mission section', async ({ page }) => {
		await page.goto('/about');
		await expect(page.getByRole('heading', { name: 'Our Mission' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Our Story' })).toBeVisible();
	});

	test('About page displays values section', async ({ page }) => {
		await page.goto('/about');
		await expect(page.locator('text=Our Values')).toBeVisible();
		await expect(page.locator('text=Family First')).toBeVisible();
		await expect(page.locator('text=Privacy & Security')).toBeVisible();
		await expect(page.locator('text=Simplicity')).toBeVisible();
	});

	test('About page has CTA button', async ({ page }) => {
		await page.goto('/about');
		await expect(page.locator('a:has-text("Get Started Free")')).toBeVisible();
	});
});
