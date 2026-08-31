import { test, expect } from '@playwright/test';
import { db } from '../../src/lib/server/db';
import { sessions, users } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createNewUser } from '../../src/lib/server/utils/createNewUser';
import { deleteAccount } from '../../src/lib/server/db/actions/accounts';
import { deleteUser } from '../../src/lib/server/db/actions/users';
import { deleteCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { lucia } from '$lib/server/auth';

const testEmail = `delivered+settings${Date.now()}@resend.dev`;

async function loginWithSession(page: any, userEmail: string) {
	const user = await db.select().from(users).where(eq(users.email, userEmail));
	if (!user[0]) throw new Error('User not found');
	const session = await lucia.createSession(user[0].id, {});
	const cookie = lucia.createSessionCookie(session.id);
	await page.context().addCookies([{
		name: cookie.name,
		value: cookie.value,
		domain: 'localhost',
		path: '/',
		httpOnly: cookie.attributes.httpOnly,
		secure: cookie.attributes.secure,
		sameSite: 'Lax'
	}]);
}

test.beforeEach(async () => {
	const existingUser = await db.select().from(users).where(eq(users.email, testEmail));
	if (existingUser[0]) {
		await db.delete(sessions).where(eq(sessions.userId, existingUser[0].id));
		await deleteAccount(testEmail);
		await deleteUser(existingUser[0].id);
		await deleteCodesByEmail(testEmail);
	}
	await createNewUser('test', 'settings', testEmail);
});

test.afterEach(async () => {
	const user = await db.select().from(users).where(eq(users.email, testEmail));
	if (user[0]) {
		await db.delete(sessions).where(eq(sessions.userId, user[0].id));
		await deleteAccount(testEmail);
		await deleteUser(user[0].id);
		await deleteCodesByEmail(testEmail);
	}
});

test.describe('Settings Page - Profile', () => {
	test.beforeEach(async ({ page }) => {
		await loginWithSession(page, testEmail);
		await page.goto('/account');
		await page.waitForLoadState('networkidle');
	});

	test('displays profile section with name fields', async ({ page }) => {
		await expect(page.locator('h1:has-text("Account Settings")')).toBeVisible();
		await expect(page.getByLabel('First Name')).toBeVisible();
		await expect(page.getByLabel('Last Name')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Update Profile' })).toBeVisible();
	});

	test('profile fields prefilled with user info', async ({ page }) => {
		await expect(page.getByLabel('First Name')).toHaveValue('test');
		await expect(page.getByLabel('Last Name')).toHaveValue('settings');
	});
});

test.describe('Settings Page - Calendar Settings', () => {
	test.beforeEach(async ({ page }) => {
		await loginWithSession(page, testEmail);
		await page.goto('/account');
		await page.waitForLoadState('networkidle');
		await page.locator('a[href="#calendar"]').click();
		await expect(page.getByRole('heading', { name: 'Calendar Settings' })).toBeVisible();
	});

	test('displays calendar settings section', async ({ page }) => {
		await expect(page.getByLabel('Week Starts On')).toBeVisible();
		await expect(page.getByLabel('Time Zone')).toBeVisible();
		await expect(page.getByLabel('Default View')).toBeVisible();
		await expect(page.getByLabel('Default Calendar')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Save Calendar Settings' })).toBeVisible();
	});

	test('shows smart event creation toggle', async ({ page }) => {
		await expect(page.locator('input[name="autoParseEventDetails"]')).toBeVisible();
	});

	test('shows daily verse and translation settings', async ({ page }) => {
		await expect(page.locator('input[name="showDailyVerse"]')).toBeVisible();
		await expect(page.getByLabel('Translation')).toBeVisible();
	});

	test('shows dashboard module toggles', async ({ page }) => {
		await expect(page.locator('text=Dashboard modules')).toBeVisible();
		await expect(page.locator('input[name="module_verse"]')).toBeVisible();
		await expect(page.locator('input[name="module_glance"]')).toBeVisible();
	});
});

test.describe('Settings Page - Subscription', () => {
	test.beforeEach(async ({ page }) => {
		await loginWithSession(page, testEmail);
		await page.goto('/account');
		await page.waitForLoadState('networkidle');
		await page.locator('a[href="#subscription"]').click();
		await expect(page.locator('#subscription')).toBeVisible();
	});

	test('shows current plan', async ({ page }) => {
		await expect(page.locator('text=Current Plan')).toBeVisible();
		await expect(page.locator('text=You\'re on the Free plan.')).toBeVisible();
	});

	test('shows family master upgrade section with pricing link', async ({ page }) => {
		await expect(page.locator('text=Family Master')).toBeVisible();
		await expect(page.locator('a[href="/pricing"]')).toBeVisible();
	});

	test('has join waitlist link', async ({ page }) => {
		await expect(page.locator('a[href="/checkout?plan=monthly"]')).toBeVisible();
	});
});
