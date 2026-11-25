import { test, expect } from '@playwright/test';
import { SESSION_COOKIE } from '../testUtils';
import { LoginPage } from '../pageObjects/login';

/**
 * A signed-out visitor on /login who clicks "Start planning — no account
 * needed" must land on /calendar. Only a DOCUMENT navigation creates the
 * Anonymous Account, so the link has to leave the SvelteKit client router.
 *
 * Doc: src/lib/domains/access/README.md#invariants
 */
test('Guest start from login lands on the calendar as an Anonymous Account', async ({ page }) => {
	const loginPage = new LoginPage(page);

	await test.step('Open /login signed out', async () => {
		await loginPage.goto();
		const cookies = await page.context().cookies();
		expect(cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();
	});

	await test.step('Click the guest-start link', async () => {
		await page.getByRole('link', { name: 'Start planning — no account needed' }).click();
		await page.waitForURL('**/calendar', { timeout: 15000 });
		await expect(page.locator('[data-testid="calendar-card"]').first()).toBeVisible();
	});

	await test.step('Verify the visitor is an Anonymous Account', async () => {
		const response = await page.request.get('/api/me');
		expect(response.status()).toBe(200);
		const me: { email: string | null; isAnonymous: boolean } = await response.json();
		expect(me.isAnonymous).toBe(true);
		expect(me.email).toBeNull();
	});
});
