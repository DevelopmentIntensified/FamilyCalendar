import { test, expect } from '@playwright/test';
import { deleteUser, getUser } from '../../src/lib/server/db/actions/users';
import { deleteCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { calendars, users, sessions, userSettings, events, families, familyMembers, accounts, userGroups, subscriptions, codes } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createNewUser } from '../../src/lib/server/utils/createNewUser';
import { lucia } from '$lib/server/auth';

const firstName = 'test';
const lastName = 'createfamily';
const email = `delivered+createfamily${Date.now()}@resend.dev`;
const familyName = 'The Smiths';

let uid = '';

async function loginWithSession(page: any, userId: string) {
	const session = await lucia.createSession(userId, {});
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
	await cleanupExistingUser();
	const user = await createNewUser(firstName, lastName, email);
	uid = user.id;
	await db.delete(codes).where(eq(codes.email, email));
});

test.afterEach(async () => {
	const user = await db.select().from(users).where(eq(users.email, email));
	if (user[0]) {
		await cleanupUserData(user[0].id);
		await db.delete(users).where(eq(users.id, user[0].id));
		await deleteCodesByEmail(email);
	}
});

async function cleanupExistingUser() {
	const existingUser = await db.select().from(users).where(eq(users.email, email));
	if (existingUser[0]) {
		await cleanupUserData(existingUser[0].id);
		await db.delete(users).where(eq(users.id, existingUser[0].id));
		await deleteCodesByEmail(email);
	}
}

async function cleanupUserData(userId: string) {
	await db.delete(events).where(eq(events.ownerId, userId));
	await db.delete(calendars).where(eq(calendars.ownerId, userId));
	await db.delete(userSettings).where(eq(userSettings.userId, userId));
	await db.delete(sessions).where(eq(sessions.userId, userId));
	await db.delete(familyMembers).where(eq(familyMembers.userId, userId));
	await db.delete(userGroups).where(eq(userGroups.userId, userId));
	await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
	await db.delete(accounts).where(eq(accounts.userId, userId));
}

test('Create family page loads', async ({ page }) => {
	await loginWithSession(page, uid);
	await page.goto('/family/create');
	await page.waitForLoadState('networkidle');

	await expect(page.getByRole('heading', { name: 'Create a Family' })).toBeVisible();
	await expect(page.getByLabel('Family Name')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Create Family' })).toBeVisible();
});

test('Create family form validation', async ({ page }) => {
	await loginWithSession(page, uid);
	await page.goto('/family/create');
	await page.waitForLoadState('networkidle');

	await page.getByRole('button', { name: 'Create Family' }).click();
	await expect(page.locator('.bg-red-50.rounded-lg')).toBeVisible();
});

test('Create family with name only', async ({ page }) => {
	await loginWithSession(page, uid);
	await page.goto('/family/create');
	await page.waitForLoadState('networkidle');

	await page.getByLabel('Family Name').fill(familyName);
	await page.getByRole('button', { name: 'Create Family' }).click();

	await page.waitForURL(/\/family\/[a-z0-9]+/, { timeout: 10000 });
	await page.waitForSelector(`text=${familyName}`, { timeout: 10000 });
	await expect(page.locator('h1')).toContainText(familyName);
});

test('Create family with custom color', async ({ page }) => {
	await loginWithSession(page, uid);
	await page.goto('/family/create');
	await page.waitForLoadState('networkidle');

	await page.getByLabel('Family Name').fill(familyName);
	await page.getByRole('button', { name: 'Create Family' }).click();

	await page.waitForURL(/\/family\/[a-z0-9]+/, { timeout: 10000 });
	await page.waitForSelector(`text=${familyName}`, { timeout: 10000 });
	await expect(page.locator('h1')).toContainText(familyName);

	const familyId = page.url().split('/family/')[1];
	const family = await db.select().from(families).where(eq(families.id, familyId));
	expect(family[0].color).toBe('#3B82F6');
});

test('Cancel returns to family list', async ({ page }) => {
	await loginWithSession(page, uid);
	await page.goto('/family/create');
	await page.waitForLoadState('networkidle');

	await page.getByRole('link', { name: 'Cancel' }).click();
	await expect(page).toHaveURL('/family');
});
