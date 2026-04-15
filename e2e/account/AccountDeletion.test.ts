import { test, expect } from '@playwright/test';
import { deleteUser, getUser } from '../../src/lib/server/db/actions/users';
import { deleteCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { calendars, users, sessions, userSettings, events, accounts, families, familyMembers, groups, userGroups, subscriptions, codes } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createNewUser } from '../../src/lib/server/utils/createNewUser';
import { lucia } from '$lib/server/auth';

const firstName = 'test';
const lastName = 'delete';
const email = `delivered+delete${Date.now()}@resend.dev`;

let uid = '';

async function loginWithSession(page: any, email: string) {
	const user = await db.select().from(users).where(eq(users.email, email));
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

test('Account deletion removes user and all related data', async ({ page }) => {
	await test.step('Login with session', async () => {
		await loginWithSession(page, email);
	});

	await test.step('Navigate to account page', async () => {
		await page.goto('/account');
		await page.waitForLoadState('networkidle');
	});

	await test.step('Click delete account button', async () => {
		const deleteButton = page.getByRole('button', { name: 'Delete Account' });
		await deleteButton.click();
	});

	await test.step('Confirm deletion with user ID', async () => {
		const confirmationInput = page.getByRole('textbox', { name: 'Confirmation' });
		await confirmationInput.fill(uid);
		await confirmationInput.dispatchEvent('input');

		const confirmButton = page.getByRole('button', { name: 'Confirm Deletion' });
		await confirmButton.click();

		await page.waitForTimeout(3000);
	});

	await test.step('Verify user is deleted from DB', async () => {
		const deletedUser = await getUser(uid);
		expect(deletedUser).toBeUndefined();
	});

	await test.step('Verify related data is cleaned up', async () => {
		const relatedSessions = await db.select().from(sessions).where(eq(sessions.userId, uid));
		expect(relatedSessions).toHaveLength(0);

		const relatedAccounts = await db.select().from(accounts).where(eq(accounts.userId, uid));
		expect(relatedAccounts).toHaveLength(0);

		const relatedUserSettings = await db.select().from(userSettings).where(eq(userSettings.userId, uid));
		expect(relatedUserSettings).toHaveLength(0);

		const relatedCalendars = await db.select().from(calendars).where(eq(calendars.ownerId, uid));
		expect(relatedCalendars).toHaveLength(0);

		const relatedEvents = await db.select().from(events).where(eq(events.ownerId, uid));
		expect(relatedEvents).toHaveLength(0);
	});
});

test('Account deletion redirects to home page', async ({ page }) => {
	await test.step('Login with session', async () => {
		await loginWithSession(page, email);
	});

	await test.step('Navigate to account page and delete', async () => {
		await page.goto('/account');
		await page.waitForLoadState('networkidle');

		await page.getByRole('button', { name: 'Delete Account' }).click();
		await page.getByRole('textbox', { name: 'Confirmation' }).fill(uid);
		await page.getByRole('button', { name: 'Confirm Deletion' }).click();
	});

	await test.step('Verify redirect to home', async () => {
		await expect(page).toHaveURL('/');
	});
});