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
		await expect(page.locator('text=Account Settings')).toBeVisible();
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
		await page.click('a:has-text("Account Settings")');
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