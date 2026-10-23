import { db } from '$lib/server/db';
import { users, subscriptions, tasks, authAccount, type User } from '$lib/server/db/schema';
import { createUserSettings } from '$lib/server/db/actions/userSettings';
import { generateId } from '$lib/server/utils/generateId';
import { pickWritableFields } from '$lib/server/utils/pickWritableFields';
import { ANONYMOUS_EMAIL_DOMAIN } from '$lib/utils/anonymous';
import { eq, and, lt, sql } from 'drizzle-orm';

// #168: the generic update seam writes profile fields only; privilege fields
// (email, emailVerified, passwordHash, roles) each get a dedicated action below.
const USER_UPDATE_FIELDS = ['firstName', 'lastName'] as const;

export type UserUpdateData = Partial<Pick<User, (typeof USER_UPDATE_FIELDS)[number]>>;

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
	const insertValues = {
		...data,
		emailVerified: data.emailVerified ?? false,
		roles: data.roles ?? []
	};

	if (!data.passwordHash) {
		const [createdUser] = await db.insert(users).values(insertValues).returning();
		return createdUser;
	}

	// #196 slice 5: password users get BOTH the legacy `users.passwordHash`
	// column (login/password verifies against it — bcryptjs stays) and the
	// better-auth `auth_account` credential row (same shape migration 018
	// backfilled for existing users), atomically so a failed account insert
	// never strands a user without credentials.
	const [createdUser] = await db.transaction(async (tx) => {
		const [user] = await tx.insert(users).values(insertValues).returning();
		await tx.insert(authAccount).values({
			id: `pw-${user.id}`,
			userId: user.id,
			providerId: 'credential',
			accountId: user.id,
			password: data.passwordHash
		});
		return [user];
	});
	return createdUser;
}

export async function updateUser(id: string, data: UserUpdateData) {
	const [updatedUser] = await db
		.update(users)
		.set(pickWritableFields(data, USER_UPDATE_FIELDS))
		.where(eq(users.id, id))
		.returning();
	return updatedUser;
}

export async function verifyUserEmail(userId: string) {
	const [updatedUser] = await db
		.update(users)
		.set({ emailVerified: true })
		.where(eq(users.id, userId))
		.returning();
	return updatedUser;
}

export async function setUserPasswordHash(userId: string, passwordHash: string) {
	const [updatedUser] = await db
		.update(users)
		.set({ passwordHash })
		.where(eq(users.id, userId))
		.returning();
	return updatedUser;
}

export async function deleteUser(id: string) {
	// activeSubscriptions.userId is the only user FK without a cascade, so
	// the subscription rows must go first or Postgres rejects the delete —
	// account deletion would 500 after the session was already invalidated.
	await db.transaction(async (tx) => {
		// The tasks.assignedTo FK set-nulls during the users delete below;
		// the assignment status must be cleared in the SAME transaction or
		// the un-assigned task keeps a ghost 'pending'/'accepted' status.
		await tx.update(tasks).set({ assignmentStatus: 'none' }).where(eq(tasks.assignedTo, id));
		await tx.delete(subscriptions).where(eq(subscriptions.userId, id));
		await tx.delete(users).where(eq(users.id, id));
	});
}

export async function deleteUserByEmail(email: string) {
	await db.delete(users).where(eq(users.email, email));
}

export async function createAnonymousUser() {
	// Anonymous Account (better-auth anonymous model): placeholder email
	// instead of the old null-email marker (#196 slice 1).
	const userId = generateId(15);
	const [createdUser] = await db
		.insert(users)
		.values({
			id: userId,
			firstName: 'Guest',
			lastName: '',
			email: userId + ANONYMOUS_EMAIL_DOMAIN,
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
		.where(
			and(
				sql`${users.email} LIKE ${'%' + ANONYMOUS_EMAIL_DOMAIN}`,
				lt(users.lastActiveAt, inactivityCutoff)
			)
		);
}
