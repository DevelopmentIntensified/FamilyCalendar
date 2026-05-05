import { test, expect } from '@playwright/test';

test.describe('Pricing Page', () => {
	test('Pricing page loads correctly', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('h1')).toContainText(/Family Master/i);
	});

	test('Pricing page displays three pricing tiers', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.getByRole('heading', { name: 'Free' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Family Master' }).first()).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Family Master Lifetime' })).toBeVisible();
	});

	test('Pricing page displays pricing amounts', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('text=$0').first()).toBeVisible();
		await expect(page.getByText('$9', { exact: true })).toBeVisible();
		await expect(page.locator('text=$150')).toBeVisible();
	});

	test('Family Master plan is marked as most popular', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('text=Most Popular')).toBeVisible();
	});

	test('Pricing page displays feature lists for each tier', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('text=1 family')).toBeVisible();
		await expect(page.locator('text=Unlimited families')).toBeVisible();
		await expect(page.locator('text=10MB')).toBeVisible();
	});

	test('Pricing page displays FAQ section', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('text=Frequently Asked Questions')).toBeVisible();
		await expect(page.locator('text=Can I cancel anytime?')).toBeVisible();
		await expect(page.locator('text=Do you offer refunds?')).toBeVisible();
	});

	test('Pricing page has working CTA buttons', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.getByRole('link', { name: 'Join Waitlist' }).first()).toBeVisible();
	});

	test('Pricing page has contact link for custom pricing', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('a:has-text("Contact us")')).toBeVisible();
	});

	test('Pricing page is responsive on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto('/pricing');
		await expect(page.locator('h1')).toContainText(/Family Master/i);
		await expect(page.locator('text=$0').first()).toBeVisible();
		await expect(page.getByText('$9', { exact: true })).toBeVisible();
	});
});
