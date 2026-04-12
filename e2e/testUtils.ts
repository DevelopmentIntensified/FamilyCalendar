import { db } from '$lib/server/db';
import { sessions, users } from '$lib/server/db/schema';
import { lucia } from '$lib/server/auth';
import { eq } from 'drizzle-orm';

export async function createSessionForUser(email: string) {
	const user = await db.select().from(users).where(eq(users.email, email));
	if (!user[0]) throw new Error('User not found');

	const session = await lucia.createSession(user[0].id, {});
	return session;
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