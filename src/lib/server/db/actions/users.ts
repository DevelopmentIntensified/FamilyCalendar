import { db } from '$lib/server/db';
import { users, type User } from '$lib/server/db/schema';
import { createUserSettings } from '$lib/server/db/actions/userSettings';
import { eq, and, lt, sql } from 'drizzle-orm';

export async function getUsers() {
	return await db.select().from(users);
}

export async function getUser(id: string) {
	const [User] = await db.select().from(users).where(eq(users.id, id));
	return User;
}

export async function getUserByEmail(email: string) {
	const [User] = await db.select().from(users).where(eq(users.email, email));
	return User;
}

export async function emailExists(email: string): Promise<boolean> {
	const [User] = await db.select().from(users).where(eq(users.email, email));
	return !!User;
}

export async function createUser(data: {
	id?: string;
	email: string;
	passwordHash?: string;
	firstName: string;
	lastName: string;
	emailVerified?: boolean;
	roles?: string[];
	picture?: string;
	phonenumber?: string;
	phonenumberVerified?: boolean;
}) {
	const [createdUser] = await db
		.insert(users)
		.values({
			...data,
			emailVerified: data.emailVerified ?? false,
			roles: data.roles ?? []
		})
		.returning();
	return createdUser;
}

export async function updateUser(id: string, data: Partial<Omit<User, 'id'>>) {
	const [updatedUser] = await db.update(users).set(data).where(eq(users.id, id)).returning();
	return updatedUser;
}

export async function deleteUser(id: string) {
	await db.delete(users).where(eq(users.id, id));
}

export async function deleteUserByEmail(email: string) {
	await db.delete(users).where(eq(users.email, email));
}

export async function createAnonymousUser() {
	const [createdUser] = await db
		.insert(users)
		.values({
			firstName: 'Guest',
			lastName: '',
			email: null,
			emailVerified: false,
			roles: []
		})
		.returning();
	// Guest settings exist from the first request so the timezone prompt
	// has something to prefill and server date math has a zone to read.
	await createUserSettings({ userId: createdUser.id, timeZone: 'UTC' });
	return createdUser;
}

export async function touchLastActiveAt(userId: string) {
	await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, userId));
}

export async function claimEmailForUser(userId: string, email: string) {
	const [updated] = await db
		.update(users)
		.set({ email, emailVerified: true })
		.where(eq(users.id, userId))
		.returning();
	return updated;
}

export async function getStaleAnonymousUsers(inactivityCutoff: Date) {
	return await db
		.select()
		.from(users)
		.where(and(sql`${users.email} IS NULL`, lt(users.lastActiveAt, inactivityCutoff)));
}
