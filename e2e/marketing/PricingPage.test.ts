import { test, expect } from '@playwright/test';

test.describe('Pricing Page', () => {
	test('Pricing page loads correctly', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('h1')).toContainText(/Pricing/i);
	});

	test('Pricing page displays three pricing tiers', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.getByRole('heading', { name: 'Free' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Pro' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Family' })).toBeVisible();
	});

	test('Pricing page displays pricing amounts', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('text=$0')).toBeVisible();
		await expect(page.locator('text=$9')).toBeVisible();
		await expect(page.locator('text=$19')).toBeVisible();
	});

	test('Pro plan is marked as most popular', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('text=Most Popular')).toBeVisible();
	});

	test('Pricing page displays feature lists for each tier', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('text=Unlimited events')).toBeVisible();
		await expect(page.locator('text=Smart event import')).toBeVisible();
		await expect(page.locator('text=Calendar export')).toBeVisible();
	});

	test('Pricing page displays FAQ section', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('text=Frequently Asked Questions')).toBeVisible();
		await expect(page.locator('text=Can I cancel anytime?')).toBeVisible();
		await expect(page.locator('text=Do you offer refunds?')).toBeVisible();
	});

	test('Pricing page has working CTA buttons', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('a:has-text("Get Started")')).toBeVisible();
		await expect(page.locator('a:has-text("Start Free Trial")')).toBeVisible();
	});

	test('Pricing page has contact link for custom pricing', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('a:has-text("Contact us")')).toBeVisible();
	});

	test('Pricing page is responsive on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto('/pricing');
		await expect(page.locator('h1')).toContainText(/Pricing/i);
		await expect(page.locator('text=$0')).toBeVisible();
		await expect(page.locator('text=$9')).toBeVisible();
	});
});
