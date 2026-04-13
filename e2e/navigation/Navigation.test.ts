import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
	test('Homepage loads correctly', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('nav >> text=FamilyPlanz')).toBeVisible();
	});

	test('Can navigate to login page via navbar', async ({ page }) => {
		await page.goto('/');
		await page.click('nav >> text=Login');
		await expect(page).toHaveURL(/login/);
		await expect(page.locator('h1')).toContainText(/Login/i);
	});

	test('Can navigate to signup page via navbar', async ({ page }) => {
		await page.goto('/');
		await page.click('nav >> a:has-text("Sign Up")');
		await expect(page).toHaveURL(/signup/);
		await expect(page.locator('h1')).toContainText(/Sign Up/i);
	});

	test('Can navigate to about page via navbar', async ({ page }) => {
		await page.goto('/');
		await page.click('nav >> a:has-text("About")');
		await expect(page).toHaveURL(/about/);
		await expect(page.locator('h1')).toContainText(/About/i);
	});

	test('Can navigate to pricing page via navbar', async ({ page }) => {
		await page.goto('/');
		await page.click('nav >> a:has-text("Pricing")');
		await expect(page).toHaveURL(/pricing/);
		await expect(page.locator('h1')).toContainText(/Pricing/i);
	});

	test('Can navigate to contact page via navbar', async ({ page }) => {
		await page.goto('/');
		await page.click('nav >> a:has-text("Contact")');
		await expect(page).toHaveURL(/contact/);
		await expect(page.locator('h1')).toContainText(/Contact/i);
	});

	test('Mobile menu toggles correctly', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto('/');
		
		const mobileMenuButton = page.locator('nav button');
		if (await mobileMenuButton.isVisible()) {
			await mobileMenuButton.click();
			await expect(page.locator('nav >> a:has-text("Home")')).toBeVisible();
		}
	});

	test('Navbar shows correct links when logged out', async ({ page }) => {
		await page.goto('/');
		
		await expect(page.locator('nav >> a:has-text("Login")')).toBeVisible();
		await expect(page.locator('nav >> a:has-text("Sign Up")')).toBeVisible();
		await expect(page.locator('nav >> a:has-text("Home")')).toBeVisible();
		await expect(page.locator('nav >> a:has-text("About")')).toBeVisible();
		await expect(page.locator('nav >> a:has-text("Pricing")')).toBeVisible();
		await expect(page.locator('nav >> a:has-text("Contact")')).toBeVisible();
	});
});

test.describe('Footer', () => {
	test('Footer displays copyright', async ({ page }) => {
		await page.goto('/');
		const footer = page.locator('footer').last();
		await expect(footer).toContainText(/\d{4}/);
	});
});