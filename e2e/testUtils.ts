import { db } from '$lib/server/db';
import { sessions, users, calendars } from '$lib/server/db/schema';
import { lucia } from '$lib/server/auth';
import { eq } from 'drizzle-orm';
import { createNewUser } from '$lib/server/utils/createNewUser';
import { deleteAccount } from '$lib/server/db/actions/accounts';
import { deleteUser } from '$lib/server/db/actions/users';
import { createCode, deleteCodesByEmail } from '$lib/server/db/actions/codes';
import type { Page } from '@playwright/test';

export interface TestUser {
	email: string;
	firstName: string;
	lastName: string;
	uid: string;
}

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
		await deleteCodesByEmail(testUser.email);
		await deleteAccount(testUser.email);
		await db.delete(calendars).where(eq(calendars.ownerId, user[0].id));
		await deleteUser(testUser.uid);
	}
}

export async function loginWithSession(page: Page, email: string) {
	const cookie = await getSessionCookie(email);
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

export async function createVerificationCode(email: string, firstName: string, lastName: string): Promise<string> {
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

	const userSessions = await db
		.select()
		.from(sessions)
		.where(eq(sessions.userId, user[0].id));

	if (userSessions.length === 0) {
		const session = await lucia.createSession(user[0].id, {});
		return lucia.createSessionCookie(session.id);
	}

	const session = userSessions[0];
	return lucia.createSessionCookie(session.id);
}