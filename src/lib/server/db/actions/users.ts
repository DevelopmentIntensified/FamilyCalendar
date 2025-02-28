import { db } from '$lib/server/db';
import { users, type User } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export async function getUsers() {
	return await db.select().from(users);
}

export async function getUser(id: string) {
	const [User] = await db.select().from(users).where(eq(users.id, id));
	return User;
}

export async function createUser(data: Omit<Omit<Omit<User, 'createdAt'>, 'updatedAt'>, 'lastLogin'>) {
	const [createdUser] = await db.insert(users).values(data).returning();
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
