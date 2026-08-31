import { test, expect } from '@playwright/test';

test.describe('Pricing Page', () => {
	test('Pricing page loads correctly', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('h1')).toContainText(/Simple pricing for every family/i);
	});

	test('Pricing page displays three pricing tiers', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.getByRole('heading', { name: 'Free' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Family', exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Lifetime', exact: true })).toBeVisible();
	});

	test('Pricing page displays pricing amounts', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('text=$0').first()).toBeVisible();
		await expect(page.getByText('$9', { exact: true })).toBeVisible();
		await expect(page.locator('text=$150')).toBeVisible();
	});

	test('Family plan is marked as most popular', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('text=Most Popular')).toBeVisible();
	});

	test('Pricing page displays feature lists for each tier', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('text=1 family calendar')).toBeVisible();
		await expect(page.locator('text=Unlimited family members')).toBeVisible();
		await expect(page.locator('text=Unlimited smart algorithm event creations')).toBeVisible();
	});

	test('Pricing page displays FAQ section', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('text=Frequently Asked Questions')).toBeVisible();
		await expect(page.locator('text=What counts as a "family member"?')).toBeVisible();
		await expect(page.locator('text=Can I try Family Planz before paying?')).toBeVisible();
	});

	test('Pricing page has working CTA buttons', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.getByRole('link', { name: 'Start Free' }).first()).toBeVisible();
		await expect(page.getByRole('link', { name: 'Start Free Trial' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Get Lifetime Access' })).toBeVisible();
		await expect(page.locator('a[href="/signup"]').first()).toBeVisible();
	});

	test('Pricing page has contact link for custom pricing', async ({ page }) => {
		await page.goto('/pricing');
		await expect(page.locator('a:has-text("Contact us")')).toBeVisible();
	});

	test('Pricing page is responsive on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto('/pricing');
		await expect(page.locator('h1')).toContainText(/Simple pricing for every family/i);
		await expect(page.locator('text=$0').first()).toBeVisible();
		await expect(page.getByText('$9', { exact: true })).toBeVisible();
	});
});
