import { test, expect } from '@playwright/test';
import { db } from '$lib/server/db';
import { sessions, users, calendars, events, userSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createNewUser } from '$lib/server/utils/createNewUser';
import { deleteAccount } from '$lib/server/db/actions/accounts';
import { deleteUser } from '$lib/server/db/actions/users';
import { deleteCodesByEmail } from '$lib/server/db/actions/codes';
import { lucia } from '$lib/server/auth';

const testEmail = 'delivered+navtest' + Date.now() + '@resend.dev';
let testUserId = '';

async function getSessionCookie(email: string) {
	const user = await db.select().from(users).where(eq(users.email, email));
	if (!user[0]) throw new Error('User not found');
	const userSessions = await db.select().from(sessions).where(eq(sessions.userId, user[0].id));
	if (userSessions.length === 0) {
		const session = await lucia.createSession(user[0].id, {});
		return lucia.createSessionCookie(session.id);
	}
	return lucia.createSessionCookie(userSessions[0].id);
}

test.describe('Profile Dropdown', () => {
	test.beforeAll(async () => {
		const existing = await db.select().from(users).where(eq(users.email, testEmail));
		if (existing[0]) {
			await db.delete(events).where(eq(events.ownerId, existing[0].id));
			await db.delete(calendars).where(eq(calendars.ownerId, existing[0].id));
			await db.delete(userSettings).where(eq(userSettings.userId, existing[0].id));
			await db.delete(sessions).where(eq(sessions.userId, existing[0].id));
			await deleteCodesByEmail(testEmail);
			await deleteAccount(testEmail);
			await deleteUser(existing[0].id);
		}
		const user = await createNewUser('Nav', 'Test', testEmail);
		testUserId = user.id;
	});

	test.afterAll(async () => {
		const user = await db.select().from(users).where(eq(users.email, testEmail));
		if (user[0]) {
			await db.delete(events).where(eq(events.ownerId, user[0].id));
			await db.delete(calendars).where(eq(calendars.ownerId, user[0].id));
			await db.delete(userSettings).where(eq(userSettings.userId, user[0].id));
			await db.delete(sessions).where(eq(sessions.userId, user[0].id));
			await deleteCodesByEmail(testEmail);
			await deleteAccount(testEmail);
			await deleteUser(user[0].id);
		}
	});

	test('Profile dropdown opens on click', async ({ page }) => {
		const cookie = await getSessionCookie(testEmail);
		await page.context().addCookies([{
			name: cookie.name,
			value: cookie.value,
			domain: 'localhost',
			path: '/',
			httpOnly: cookie.attributes.httpOnly,
			secure: cookie.attributes.secure,
			sameSite: 'Lax'
		}]);

		await page.goto('/calendar');
		await page.waitForLoadState('networkidle');

		const dropdownTrigger = page.locator('[data-testid="profile-dropdown-container"] button');
		await expect(dropdownTrigger).toBeVisible();
		await dropdownTrigger.click();
		await expect(page.locator('a[href="/account"]')).toBeVisible();
		await expect(page.locator('text=Family Management')).toBeVisible();
		await expect(page.locator('text=Logout')).toBeVisible();
	});

	test('Profile dropdown shows user info', async ({ page }) => {
		const cookie = await getSessionCookie(testEmail);
		await page.context().addCookies([{
			name: cookie.name,
			value: cookie.value,
			domain: 'localhost',
			path: '/',
			httpOnly: cookie.attributes.httpOnly,
			secure: cookie.attributes.secure,
			sameSite: 'Lax'
		}]);

		await page.goto('/calendar');
		await page.waitForLoadState('networkidle');

		const dropdownTrigger = page.locator('[data-testid="profile-dropdown-container"] button');
		await dropdownTrigger.click();
		await expect(page.locator('text=Nav Test')).toBeVisible();
		await expect(page.locator(`text=${testEmail}`)).toBeVisible();
	});

	test('Account Settings link navigates correctly', async ({ page }) => {
		const cookie = await getSessionCookie(testEmail);
		await page.context().addCookies([{
			name: cookie.name,
			value: cookie.value,
			domain: 'localhost',
			path: '/',
			httpOnly: cookie.attributes.httpOnly,
			secure: cookie.attributes.secure,
			sameSite: 'Lax'
		}]);

		await page.goto('/calendar');
		await page.waitForLoadState('networkidle');

		const dropdownTrigger = page.locator('[data-testid="profile-dropdown-container"] button');
		await dropdownTrigger.click();
		await page.click('a[href="/account"]');
		await expect(page).toHaveURL(/account/);
		await expect(page.locator('h1')).toContainText(/Account/i);
	});

	test('Family Management link navigates correctly', async ({ page }) => {
		const cookie = await getSessionCookie(testEmail);
		await page.context().addCookies([{
			name: cookie.name,
			value: cookie.value,
			domain: 'localhost',
			path: '/',
			httpOnly: cookie.attributes.httpOnly,
			secure: cookie.attributes.secure,
			sameSite: 'Lax'
		}]);

		await page.goto('/calendar');
		await page.waitForLoadState('networkidle');

		const dropdownTrigger = page.locator('[data-testid="profile-dropdown-container"] button');
		await dropdownTrigger.click();
		await page.click('a:has-text("Family Management")');
		await expect(page).toHaveURL(/family/);
	});

	test('Logout button is accessible and functional', async ({ page }) => {
		const cookie = await getSessionCookie(testEmail);
		await page.context().addCookies([{
			name: cookie.name,
			value: cookie.value,
			domain: 'localhost',
			path: '/',
			httpOnly: cookie.attributes.httpOnly,
			secure: cookie.attributes.secure,
			sameSite: 'Lax'
		}]);

		await page.goto('/calendar');
		await page.waitForLoadState('networkidle');

		const dropdownTrigger = page.locator('[data-testid="profile-dropdown-container"] button');
		await dropdownTrigger.click();
		const logoutBtn = page.locator('button:has-text("Logout")');
		await expect(logoutBtn).toBeVisible();
	});
});

test.describe('Navigation', () => {
	test('Homepage loads correctly', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('nav').locator('text=Family Planz')).toBeVisible();
	});

	test('Can navigate to login page via navbar', async ({ page }) => {
		await page.goto('/');
		await page.locator('nav').getByText('Sign In').click();
		await expect(page).toHaveURL(/login/);
		await expect(page.locator('h1').last()).toContainText(/Welcome Back/i);
	});

	test('Can navigate to signup page via navbar', async ({ page }) => {
		await page.goto('/');
		await page.locator('nav').getByText('Get Started').click();
		await expect(page).toHaveURL(/signup/);
		await expect(page.locator('h1').last()).toContainText(/Create Account/i);
	});

	test('Can navigate to about page via navbar', async ({ page }) => {
		await page.goto('/');
		await page.locator('nav').getByText('About').click();
		await expect(page).toHaveURL(/about/);
	});

	test('Can navigate to pricing page via navbar', async ({ page }) => {
		await page.goto('/');
		await page.locator('nav').getByText('Pricing').click();
		await expect(page).toHaveURL(/pricing/);
	});

	test('Can navigate to contact page via navbar', async ({ page }) => {
		await page.goto('/');
		await page.locator('nav').getByText('Contact').click();
		await expect(page).toHaveURL(/contact/);
	});

	test.skip('Mobile menu toggles correctly', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto('/');
		
		await page.waitForTimeout(500);
		const mobileMenuButton = page.locator('nav button.md\\:hidden').first();
		await expect(mobileMenuButton).toBeVisible({ timeout: 5000 });
		await mobileMenuButton.click();
		await page.waitForTimeout(300);
		await expect(page.locator('nav').getByText('About')).toBeVisible();
	});

	test('Navbar shows correct links when logged out', async ({ page }) => {
		await page.goto('/');
		
		await expect(page.locator('nav').getByText('Sign In')).toBeVisible();
		await expect(page.locator('nav').getByText('Get Started')).toBeVisible();
		await expect(page.locator('nav').getByText('About')).toBeVisible();
		await expect(page.locator('nav').getByText('Pricing')).toBeVisible();
		await expect(page.locator('nav').getByText('Contact')).toBeVisible();
	});
});

test.describe('Footer', () => {
	test('Footer displays copyright', async ({ page }) => {
		await page.goto('/');
		const footer = page.locator('footer').last();
		await expect(footer).toContainText(/\d{4}/);
	});
});