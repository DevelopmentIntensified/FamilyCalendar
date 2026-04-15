import { test, expect } from '@playwright/test';
import { deleteAccount } from '../../src/lib/server/db/actions/accounts';
import { deleteUser, getUser } from '../../src/lib/server/db/actions/users';
import { createCode, deleteCodesByEmail, getCodesByEmail } from '../../src/lib/server/db/actions/codes';
import { db } from '../../src/lib/server/db';
import { calendars, users, sessions, userSettings, events } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createNewUser } from '../../src/lib/server/utils/createNewUser';
import { lucia } from '$lib/server/auth';

const firstName = 'test';
const lastName = 'emailchange';
const email = `delivered+emailchange${Date.now()}@resend.dev`;
const newEmail = `delivered+newemailchange${Date.now()}@resend.dev`;

let uid = '';

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
	const existingUser = await db.select().from(users).where(eq(users.email, email));
	if (existingUser[0]) {
		await db.delete(events).where(eq(events.ownerId, existingUser[0].id));
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

test('Email change triggers verification email', async ({ page }) => {
	await test.step('Login with session', async () => {
		await loginWithSession(page, email);
	});

	await test.step('Navigate to account page', async () => {
		await page.goto('/account');
		await page.waitForLoadState('networkidle');
	});

	await test.step('Change email', async () => {
		const emailInput = page.getByRole('textbox', { name: 'Email' });
		await emailInput.fill(newEmail);

		const updateButton = page.getByRole('button', { name: 'Update Email' });
		await updateButton.click();

		await page.waitForTimeout(2000);
	});

	await test.step('Verify verification code was created in DB', async () => {
		const codes = await getCodesByEmail(email);
		const emailChangeCode = codes.find(c => c.type === 'email_change' && c.pendingEmail === newEmail);
		expect(emailChangeCode).toBeDefined();
		expect(emailChangeCode?.code).toHaveLength(8);
	});

	await test.step('Verify success message', async () => {
		const successMessage = page.locator('.bg-green-50, .bg-green-100');
		await expect(successMessage.first()).toBeVisible({ timeout: 5000 });
	});
});

test('Verification link updates email', async ({ page }) => {
	await test.step('Login with session', async () => {
		await loginWithSession(page, email);
	});

	await test.step('Navigate to account page and change email', async () => {
		await page.goto('/account');
		await page.waitForLoadState('networkidle');

		const emailInput = page.getByRole('textbox', { name: 'Email' });
		await emailInput.fill(newEmail);

		const updateButton = page.getByRole('button', { name: 'Update Email' });
		await updateButton.click();

		await page.waitForTimeout(2000);
	});

	await test.step('Get verification code from DB', async () => {
		const codes = await getCodesByEmail(email);
		const emailChangeCode = codes.find(c => c.type === 'email_change' && c.pendingEmail === newEmail);
		expect(emailChangeCode).toBeDefined();

		await test.step('Navigate to verify-email page with code', async () => {
			await page.goto(`/account/verify-email?code=${emailChangeCode!.code}`);
		});

		await test.step('Submit verification', async () => {
			await page.getByPlaceholder('Enter the 8-digit code').fill(emailChangeCode!.code);
			const verifyButton = page.getByRole('button', { name: 'Verify' });
			await verifyButton.click();
			await page.waitForTimeout(2000);
			
			const successMessage = page.locator('.bg-green-100');
			await expect(successMessage).toContainText('Email verified successfully');
		});

		await test.step('Verify email was updated', async () => {
			const updatedUser = await getUser(uid);
			expect(updatedUser?.email).toBe(newEmail);
			expect(updatedUser?.emailVerified).toBe(true);
		});
	});
});