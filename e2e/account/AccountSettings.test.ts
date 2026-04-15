import { test, expect } from '@playwright/test';
import { db } from '../../src/lib/server/db';
import { sessions, users, calendars, userSettings } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createNewUser } from '../../src/lib/server/utils/createNewUser';
import { deleteAccount } from '../../src/lib/server/db/actions/accounts';
import { deleteUser, getUser } from '../../src/lib/server/db/actions/users';
import { createCode, deleteCodesByEmail, getCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { generateRandomString, type RandomReader } from '@oslojs/crypto/random';
import { lucia } from '$lib/server/auth';

const firstName = 'test';
const lastName = 'accountsettings';
const email = `delivered+accountsettings${Date.now()}@resend.dev`;

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
	const existingUser = await db.select().from(users).where(eq(users.email, email));
	if (existingUser[0]) {
		await db.delete(calendars).where(eq(calendars.ownerId, existingUser[0].id));
		await db.delete(userSettings).where(eq(userSettings.userId, existingUser[0].id));
		await db.delete(sessions).where(eq(sessions.userId, existingUser[0].id));
		await deleteAccount(email);
		await deleteUser(existingUser[0].id);
		await deleteCodesByEmail(email);
	}
	let user = await createNewUser(firstName, lastName, email);
	uid = user.id;
});

test.afterEach(async () => {
	const user = await db.select().from(users).where(eq(users.email, email));
	if (user[0]) {
		await db.delete(calendars).where(eq(calendars.ownerId, user[0].id));
		await db.delete(userSettings).where(eq(userSettings.userId, user[0].id));
		await db.delete(sessions).where(eq(sessions.userId, user[0].id));
		await deleteAccount(email);
		await deleteUser(uid);
		await deleteCodesByEmail(email);
	}
});

test('View account settings page', async ({ page }) => {
	await test.step('Login with session', async () => {
		await loginWithSession(page, email);
	});

	await test.step('Navigate to account settings', async () => {
		await page.goto('/account');
		await page.waitForLoadState('networkidle');
	});

	await test.step('Verify profile section exists', async () => {
		await expect(page.getByRole('heading', { name: 'Profile Information' })).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'First Name' })).toHaveValue(firstName);
		await expect(page.getByRole('textbox', { name: 'Last Name' })).toHaveValue(lastName);
	});

	await test.step('Verify email section exists', async () => {
		await expect(page.getByRole('heading', { name: 'Email Address' })).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue(email);
	});

	await test.step('Verify security section exists', async () => {
		await expect(page.getByRole('heading', { name: 'Security' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Logout from All Other Devices' })).toBeVisible();
	});

	await test.step('Verify danger zone section exists', async () => {
		await expect(page.getByRole('heading', { name: 'Danger Zone' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Delete Account' })).toBeVisible();
	});
});

test('Logout from all devices removes other sessions', async ({ page, context }) => {
	await test.step('Login with session', async () => {
		await loginWithSession(page, email);
	});

	await test.step('Create additional sessions in DB', async () => {
		const random: RandomReader = {
			read(bytes) {
				crypto.getRandomValues(bytes);
			}
		};

		await db.insert(sessions).values({
			id: generateRandomString(random, 'abcdefghijklmnopqrstuvwxyz', 40),
			userId: uid,
			expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
		});

		await db.insert(sessions).values({
			id: generateRandomString(random, 'abcdefghijklmnopqrstuvwxyz', 40),
			userId: uid,
			expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
		});
	});

	await test.step('Verify multiple sessions exist', async () => {
		const allSessions = await db.select().from(sessions).where(eq(sessions.userId, uid));
		expect(allSessions.length).toBeGreaterThanOrEqual(3);
	});

	await test.step('Navigate to account settings', async () => {
		await page.goto('/account');
		await page.waitForLoadState('networkidle');
	});

	await test.step('Click logout from all devices', async () => {
		await page.getByRole('button', { name: 'Logout from All Other Devices' }).click();
		await page.waitForTimeout(2000);
	});

	await test.step('Verify success message', async () => {
		const successMessage = page.locator('.bg-green-50');
		await expect(successMessage).toContainText('Logged out from all other devices');
	});

	await test.step('Verify only current session remains', async () => {
		const remainingSessions = await db.select().from(sessions).where(eq(sessions.userId, uid));
		expect(remainingSessions.length).toBe(1);
	});

	await test.step('Navigate to calendar to confirm still logged in', async () => {
		await page.goto('/calendar');
		await page.waitForURL('/calendar', { timeout: 15000 });
	});
});

test('Update profile saves changes', async ({ page }) => {
	await test.step('Login with session', async () => {
		await loginWithSession(page, email);
	});

	await test.step('Navigate to account settings', async () => {
		await page.goto('/account');
		await page.waitForLoadState('networkidle');
	});

	await test.step('Update first name', async () => {
		const firstNameInput = page.getByRole('textbox', { name: 'First Name' });
		await firstNameInput.fill('UpdatedFirst');
		await page.getByRole('button', { name: 'Update Profile' }).click();
		await page.waitForTimeout(2000);
	});

	await test.step('Verify success message', async () => {
		const successMessage = page.locator('.bg-green-50');
		await expect(successMessage).toContainText('Profile updated successfully');
	});

	await test.step('Verify database was updated', async () => {
		const updatedUser = await getUser(uid);
		expect(updatedUser?.firstName).toBe('UpdatedFirst');
	});
});
