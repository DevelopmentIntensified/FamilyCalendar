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

test.describe('Settings Page - Ad Consent', () => {
	test.beforeEach(async ({ page }) => {
		await loginWithSession(page, testEmail);
		await page.goto('/calendar/settings');
	});

	test('displays ad preferences section', async ({ page }) => {
		await expect(page.locator('h2:has-text("Ad Preferences")')).toBeVisible();
	});

	test('shows ads as events toggle', async ({ page }) => {
		const toggle = page.locator('input[name="showAdsAsEvents"]');
		await expect(toggle).toBeVisible();
	});

	test('shows ad markers toggle', async ({ page }) => {
		const toggle = page.locator('input[name="showAdMarkers"]');
		await expect(toggle).toBeVisible();
	});

	test('shows personalized ads toggle', async ({ page }) => {
		const toggle = page.locator('input[name="personalizedAds"]');
		await expect(toggle).toBeVisible();
	});

	test.describe('privacy information', () => {
		test('has privacy policy link', async ({ page }) => {
			await expect(page.locator('a[href="/privacy"]').first()).toBeVisible();
		});
	});
});

test.describe('Settings Page - Upgrade Prompts', () => {
	test.beforeEach(async ({ page }) => {
		await loginWithSession(page, testEmail);
		await page.goto('/calendar/settings');
	});

	test('displays family master section', async ({ page }) => {
		await expect(page.locator('h2:has-text("Family Master")')).toBeVisible();
	});

	test('has upgrade button linking to pricing', async ({ page }) => {
		const upgradeButton = page.locator('a[href="/pricing"]').first();
		await expect(upgradeButton).toBeVisible();
	});

	test('has annual plan option', async ({ page }) => {
		const annualButton = page.locator('a[href="/pricing?plan=annual"]');
		await expect(annualButton).toBeVisible();
	});

	test('has lifetime plan option', async ({ page }) => {
		const lifetimeButton = page.locator('a[href="/pricing?plan=lifetime"]');
		await expect(lifetimeButton).toBeVisible();
	});
});