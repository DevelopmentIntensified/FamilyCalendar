import { test as base } from '@playwright/test';
import { db } from '$lib/server/db';
import { authSession, users, calendars, events, userSettings } from '$lib/server/db/schema';
import { createSession, createSessionCookie } from '$lib/server/auth';
import { eq } from 'drizzle-orm';
import { createAccount, deleteAccount } from '$lib/server/db/actions/accounts';
import { createUser, deleteUser } from '$lib/server/db/actions/users';
import { createCode, deleteCodesByEmail } from '$lib/server/db/actions/codes';
import { createUserSettings } from '$lib/server/db/actions/userSettings';
import { ensurePersonalCalendar } from '$lib/server/db/actions/calendar';
import { generateId } from '$lib/server/utils/generateId';
import { randHex } from '@ngneat/falso';
import type { Page } from '@playwright/test';

export interface TestUser {
	email: string;
	firstName: string;
	lastName: string;
	uid: string;
}

/**
 * A verified person for the e2e suite to act as: user row, `email` provider
 * account, a random-colour settings row and a personal calendar. This is the
 * one seeding helper the specs share (previously `src/lib/server/utils/createNewUser`,
 * deleted with access' S8); it writes the same rows in the same order.
 */
export const createNewUser = async function (firstName: string, lastName: string, email: string) {
	const user = await createUser({
		id: generateId(15),
		firstName,
		lastName,
		email,
		emailVerified: true,
		picture: '',
		phonenumber: '',
		phonenumberVerified: false,
		roles: []
	});

	await createAccount({
		provider: 'email',
		userId: user.id,
		providerAccountId: email
	});

	await createUserSettings({
		userId: user.id,
		color: randHex()
	});

	await ensurePersonalCalendar(user.id);

	return user;
};

export async function setupTestUser(overrides?: Partial<TestUser>): Promise<TestUser> {
	const timestamp = Date.now() + Math.floor(Math.random() * 10000);
	const firstName = overrides?.firstName || 'test';
	const lastName = overrides?.lastName || 'user';
	const email = overrides?.email || `delivered+${firstName}${lastName}${timestamp}@resend.dev`;

	const user = await createNewUser(firstName, lastName, email);

	return {
		email,
		firstName,
		lastName,
		uid: user.id
	};
}

export async function teardownTestUser(testUser: TestUser) {
	const user = await db.select().from(users).where(eq(users.email, testUser.email));
	if (user[0]) {
		await db.delete(events).where(eq(events.ownerId, user[0].id));
		await db.delete(calendars).where(eq(calendars.ownerId, user[0].id));
		await db.delete(userSettings).where(eq(userSettings.userId, user[0].id));
		await db.delete(authSession).where(eq(authSession.userId, user[0].id));
		await deleteCodesByEmail(testUser.email);
		await deleteAccount(testUser.email);
		await deleteUser(testUser.uid);
	}
}

export const test = base.extend<{ testUser: TestUser }>({
	testUser: [
		// eslint-disable-next-line no-empty-pattern -- Playwright requires the fixtures object-destructuring pattern even when no fixture is needed.
		async ({}, use) => {
			const testUser = await setupTestUser();
			await use(testUser);
			await teardownTestUser(testUser);
		},
		{ scope: 'test' as const, timeout: 30000 }
	]
});

export { expect } from '@playwright/test';

export async function loginWithSession(page: Page, email: string) {
	const cookie = await getSessionCookie(email);
	await page.context().addCookies([
		{
			name: cookie.name,
			value: cookie.value,
			domain: 'localhost',
			path: '/',
			httpOnly: cookie.attributes.httpOnly,
			// Both e2e servers are plain http on localhost (4173 main, 4174
			// pages), while the app's cookie policy marks the session Secure
			// whenever the *server* runs with NODE_ENV=production — which the
			// pages harness does. A Secure cookie is not stored for an http
			// origin, so the browser would silently drop the session: never
			// copy the attribute here, the harness is http by construction.
			secure: false,
			sameSite: 'Lax'
		}
	]);
}

export async function createVerificationCode(
	email: string,
	firstName: string,
	lastName: string
): Promise<string> {
	const uniqueCode = Math.random().toString(36).substring(2, 10).toUpperCase();
	await createCode({
		code: uniqueCode,
		expiresAt: new Date(Date.now() + 1000 * 60 * 15),
		email,
		firstName,
		lastName,
		emailId: 'test-email-id'
	});
	return uniqueCode;
}

export async function getSessionCookie(email: string) {
	const user = await db.select().from(users).where(eq(users.email, email));
	if (!user[0]) throw new Error('User not found');

	// 196 cutover: session minting goes through the better-auth data model —
	// a row in `authSession` plus the module's signed cookie — not lucia.
	const session = await createSession(user[0].id);
	const cookie = await createSessionCookie({ token: session.token });
	return cookie;
}

/**
 * End the pool the cookie helpers above run on (the app's module-level
 * `db`). A Playwright worker that used GET session cookies must call this
 * before it is done or the open socket keeps the process alive; test files
 * call it from `test.afterAll`.
 */
export async function closeSessionDb(): Promise<void> {
	await db.$client.end({ timeout: 5 });
}
