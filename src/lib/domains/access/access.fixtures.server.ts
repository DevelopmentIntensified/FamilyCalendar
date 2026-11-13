/**
 * Row builders for access's db tests. Access owns only `claim_tokens`, so
 * most of these write a foreign row the module's flows act on (the user, its
 * provider `accounts` row, a session, the credential `auth_account` row) —
 * the same precedent as `seedTaskFamily`. Every name carries the `Access`
 * noun so it cannot collide with another module's fixtures in one test file.
 *
 *   const guest = await seedAccessGuest();
 *   await seedAccessEmailCode({ code: '24681357', email, type: 'password-signup' });
 *
 * Doc: ./README.md#how-to-test
 */
import {
	accounts,
	apiTokens,
	authAccount,
	authSession,
	codes
} from '$lib/kernel/db/tables.server';
import { sha256Hex } from '$lib/kernel/ids/ids';
import { seedUser, uniqueSuffix } from '$lib/kernel/testing/seedRows.server';
import { testDb } from '$lib/kernel/testing/testDb.server';

/** The reserved Anonymous Account domain (`src/lib/utils/anonymous.ts:12`). */
export const ACCESS_ANON_DOMAIN = '@anonymous.placeholder.invalid';

/** bcrypt hash of `correct-horse-battery` at cost 8 — a real compare, no hashing in tests. */
export const ACCESS_PASSWORD_HASH =
	'$2b$08$Au1ENwjxEYcZzc1EZQ/M5Oe1ZJaBJpJv/MMVQqr7lncxWRNe7/P1C';

/** A guest (Anonymous Account) row: the placeholder email is what makes it a guest. */
export async function seedAccessGuest() {
	return seedUser(testDb(), {
		email: `guest-${uniqueSuffix()}${ACCESS_ANON_DOMAIN}`,
		firstName: 'Guest',
		lastName: '',
		emailVerified: false
	});
}

/** A registered person with a password and a verified address. */
export async function seedAccessPasswordUser(email: string) {
	return seedUser(testDb(), {
		email,
		passwordHash: ACCESS_PASSWORD_HASH,
		emailVerified: true
	});
}

/** A personal `fp_` token row: only the sha256 digest is stored. */
export async function seedAccessApiToken(userId: string, plaintext: string, name = 'Phone') {
	await testDb()
		.insert(apiTokens)
		.values({ userId, name, tokenHash: sha256Hex(plaintext) });
}

/**
 * A hashed, type-stamped email code row, exactly as `issueVerificationCode`
 * writes it (`login` / `signup` / `password-signup`). `expiresAt` defaults to a
 * far-future date: the handlers delete dead codes before they look one up.
 */
export async function seedAccessEmailCode(input: {
	code: string;
	email: string;
	type: string;
	firstName?: string;
	lastName?: string;
	expiresAt?: Date;
}) {
	await testDb()
		.insert(codes)
		.values({
			code: sha256Hex(input.code),
			email: input.email,
			type: input.type,
			firstName: input.firstName ?? null,
			lastName: input.lastName ?? null,
			expiresAt: input.expiresAt ?? new Date('2099-01-01T00:00:00.000Z')
		});
}

/** A provider account row: the email-keyed lookup `getAccount` reads first. */
export async function seedAccessProviderAccount(
	providerAccountId: string,
	userId: string,
	provider = 'email'
) {
	await testDb().insert(accounts).values({ provider, providerAccountId, userId });
}

/** A live web session row for `userId`. */
export async function seedAccessSession(
	userId: string,
	overrides: { id?: string; token?: string; expiresAt?: Date } = {}
) {
	const suffix = uniqueSuffix();
	const [row] = await testDb()
		.insert(authSession)
		.values({
			id: overrides.id ?? `session-${suffix}`,
			token: overrides.token ?? `session-token-${suffix}`,
			userId,
			expiresAt: overrides.expiresAt ?? new Date('2099-01-01T00:00:00.000Z')
		})
		.returning();
	return row;
}

/**
 * A Better Auth credential row, seeded from `users.passwordHash` by migration
 * 018. No sign-in path reads it today (Q-104), so nothing keeps it in step.
 */
export async function seedAccessAuthAccount(userId: string, password: string) {
	await testDb().insert(authAccount).values({
		id: `auth-account-${uniqueSuffix()}`,
		userId,
		providerId: 'credential',
		accountId: userId,
		password
	});
}
