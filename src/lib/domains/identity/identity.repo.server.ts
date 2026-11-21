/**
 * identity repo: every query over this module's tables — `users`,
 * `userSettings`, `authSession`, `authAccount`, `apiTokens`, `codes` and
 * `accounts`. `authVerification` has no reader or writer yet.
 *
 * Each function takes `db: Db` first, contains no authorization and no
 * business rules (the allowlists, the token format and the code key live in
 * the rules files), and touches only identity's tables (R3): no join into
 * `calendars`, `familyMembers` or `adConsentRecords` — those answers come
 * through `ctx.calendarAccess` / `ctx.adConsent`.
 *
 * Nothing here reads the process clock (R5): every write that stamps a row
 * takes the caller's `now` and sets it explicitly, including the `updatedAt`
 * that the `users` / `userSettings` columns would otherwise fill through
 * `$onUpdate(systemClock.now())`. A lookup miss is `null`.
 *
 * Security: no function returns a token hash. The mint answers the safe record
 * only, the list never selects `token_hash`, and the Bearer lookup answers the
 * token id and its owner.
 *
 * Doc: ./README.md#invariants
 */
import { and, eq, inArray, like, lt, ne } from 'drizzle-orm';
import type { Db } from '$lib/kernel/db/database.server';
import {
	accounts,
	apiTokens,
	authAccount,
	authSession,
	codes,
	userSettings,
	users,
	type AccountRow,
	type AuthSessionRow,
	type CodeRow,
	type NewAccountRow,
	type NewCodeRow,
	type NewUserRow,
	type NewUserSettingsRow,
	type UserRow,
	type UserSettingsRow
} from '$lib/kernel/db/tables.server';
import type { EmailCodeKey } from './identity.code.rules';
import type { ApiTokenListing, ApiTokenRecord } from './identity.contract';
import { ANONYMOUS_EMAIL_DOMAIN, profilePatch } from './identity.person.rules';
import { writableSettings } from './identity.settings.rules';

// --- People -----------------------------------------------------------------

export async function findPersonById(db: Db, id: string): Promise<UserRow | null> {
	const [row] = await db.select().from(users).where(eq(users.id, id));
	return row ?? null;
}

/** Exact, case-sensitive match (legacy `getUserByEmail`). */
export async function findPersonByEmail(db: Db, email: string): Promise<UserRow | null> {
	const [row] = await db.select().from(users).where(eq(users.email, email));
	return row ?? null;
}

/**
 * Stored names for a set of ids, in no claimed order — the display-name read
 * another module makes for ids it already holds (tasks' stats figures and its
 * assignee/creator fields). Unknown ids are simply absent; an empty id list
 * spends no query.
 */
export async function listPersonNamesByIds(
	db: Db,
	ids: readonly string[]
): Promise<{ id: string; firstName: string; lastName: string }[]> {
	if (ids.length === 0) return [];
	return await db
		.select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
		.from(users)
		.where(inArray(users.id, [...ids]));
}

/** The timestamp columns `insertPerson` stamps itself. */
type PersonStamps = 'createdAt' | 'updatedAt' | 'lastActiveAt' | 'lastLogin';

/**
 * One users row. `createdAt`, `updatedAt`, `lastActiveAt` and `lastLogin` all
 * take `now`, the instant the four column defaults used to share.
 */
export async function insertPerson(
	db: Db,
	values: Omit<NewUserRow, PersonStamps>,
	now: Date
): Promise<UserRow> {
	const [row] = await db
		.insert(users)
		.values({ ...values, createdAt: now, updatedAt: now, lastActiveAt: now, lastLogin: now })
		.returning();
	if (!row) throw new Error('insertPerson: insert returned no row');
	return row;
}

/**
 * The better-auth credential row a password person gets beside
 * `users.passwordHash` (#196 slice 5): id `pw-<userId>`, provider
 * `credential`, the user as its own account id — the shape migration 018
 * backfilled. Access's sign-up writes it in the same transaction as the person.
 */
export async function insertPasswordCredential(
	db: Db,
	userId: string,
	passwordHash: string,
	now: Date
): Promise<void> {
	await db.insert(authAccount).values({
		id: `pw-${userId}`,
		userId,
		providerId: 'credential',
		accountId: userId,
		password: passwordHash,
		createdAt: now,
		updatedAt: now
	});
}

/**
 * The generic profile write: `firstName`/`lastName` only. Privilege fields
 * handed in are dropped at runtime (`profilePatch`, #168), so a cast cannot
 * reach `email`, `emailVerified`, `passwordHash` or `roles`.
 */
export async function updatePersonNames(
	db: Db,
	id: string,
	data: Partial<UserRow>,
	now: Date
): Promise<UserRow | null> {
	const [row] = await db
		.update(users)
		.set({ ...profilePatch(data), updatedAt: now })
		.where(eq(users.id, id))
		.returning();
	return row ?? null;
}

/** The one write of `emailVerified: true`. */
export async function markPersonEmailVerified(
	db: Db,
	id: string,
	now: Date
): Promise<UserRow | null> {
	const [row] = await db
		.update(users)
		.set({ emailVerified: true, updatedAt: now })
		.where(eq(users.id, id))
		.returning();
	return row ?? null;
}

/** The one write of `users.passwordHash` (already bcrypt-hashed by the caller). */
export async function setPersonPasswordHash(
	db: Db,
	id: string,
	passwordHash: string,
	now: Date
): Promise<UserRow | null> {
	const [row] = await db
		.update(users)
		.set({ passwordHash, updatedAt: now })
		.where(eq(users.id, id))
		.returning();
	return row ?? null;
}

/** Claiming: a guest (or a person changing address) gets a real, verified email. */
export async function claimPersonEmail(
	db: Db,
	id: string,
	email: string,
	now: Date
): Promise<UserRow | null> {
	const [row] = await db
		.update(users)
		.set({ email, emailVerified: true, updatedAt: now })
		.where(eq(users.id, id))
		.returning();
	return row ?? null;
}

/** The Inactivity Window input; the hourly throttle is `touchDue`. */
export async function touchPersonLastActive(db: Db, id: string, now: Date): Promise<void> {
	await db.update(users).set({ lastActiveAt: now, updatedAt: now }).where(eq(users.id, id));
}

/**
 * Deletes the users row; its sessions, settings, tokens and credential rows
 * cascade. Other modules' rows (the non-cascading `subscriptions`, task
 * assignment) are the account screen's deletion composition, in the same
 * transaction. True when a row went.
 */
export async function deletePersonRow(db: Db, id: string): Promise<boolean> {
	const deleted = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
	return deleted.length > 0;
}

/**
 * Anonymous Accounts idle since strictly before the cutoff (the cleanup cron's
 * input). The placeholder domain is matched as a suffix, as the predicate does.
 */
export async function listStaleAnonymousPeople(
	db: Db,
	inactivityCutoff: Date
): Promise<UserRow[]> {
	return await db
		.select()
		.from(users)
		.where(
			and(
				like(users.email, `%${ANONYMOUS_EMAIL_DOMAIN}`),
				lt(users.lastActiveAt, inactivityCutoff)
			)
		);
}

// --- Settings ---------------------------------------------------------------

export async function findSettingsByPerson(
	db: Db,
	userId: string
): Promise<UserSettingsRow | null> {
	const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
	return row ?? null;
}

/**
 * A new settings row. Columns the caller omits take their defaults, so
 * `{userId, timeZone:'UTC'}` is the sparse sign-up row; `updatedAt` is `now`.
 */
export async function insertSettings(
	db: Db,
	values: Omit<NewUserSettingsRow, 'updatedAt'>,
	now: Date
): Promise<UserSettingsRow> {
	const [row] = await db
		.insert(userSettings)
		.values({ ...values, updatedAt: now })
		.returning();
	if (!row) throw new Error('insertSettings: insert returned no row');
	return row;
}

/**
 * Writes the allowlisted columns (explicit `null`s included; `undefined`,
 * row keys, `updatedAt` and the read-only AI flags dropped by
 * `writableSettings`) and stamps `updatedAt` with `now`, even when nothing
 * writable was handed in. Null when the person has no row.
 */
export async function updateSettings(
	db: Db,
	userId: string,
	data: Partial<UserSettingsRow>,
	now: Date
): Promise<UserSettingsRow | null> {
	const [row] = await db
		.update(userSettings)
		.set({ ...writableSettings(data), updatedAt: now })
		.where(eq(userSettings.userId, userId))
		.returning();
	return row ?? null;
}

// --- Sessions ---------------------------------------------------------------

/** What a new session row needs; the id and token come from `ctx.ids`. */
export type NewSessionValues = {
	readonly id: string;
	readonly token: string;
	readonly userId: string;
	readonly expiresAt: Date;
};

/** Inserts a session and returns the row as stored (`ipAddress`/`userAgent` stay null). */
export async function insertSession(
	db: Db,
	values: NewSessionValues,
	now: Date
): Promise<AuthSessionRow> {
	const [row] = await db
		.insert(authSession)
		.values({ ...values, createdAt: now, updatedAt: now })
		.returning();
	if (!row) throw new Error('insertSession: insert returned no row');
	return row;
}

/** Lookup by the raw (unsigned) session token. */
export async function findSessionByToken(db: Db, token: string): Promise<AuthSessionRow | null> {
	const [row] = await db.select().from(authSession).where(eq(authSession.token, token));
	return row ?? null;
}

/** The sliding renewal: a new expiry, `updatedAt` = `now`. */
export async function renewSession(
	db: Db,
	id: string,
	expiresAt: Date,
	now: Date
): Promise<void> {
	await db
		.update(authSession)
		.set({ expiresAt, updatedAt: now })
		.where(eq(authSession.id, id));
}

export async function deleteSession(db: Db, id: string): Promise<void> {
	await db.delete(authSession).where(eq(authSession.id, id));
}

/** "Log out everywhere": every session of the person. Returns how many went. */
export async function deleteSessionsForPerson(db: Db, userId: string): Promise<number> {
	const deleted = await db
		.delete(authSession)
		.where(eq(authSession.userId, userId))
		.returning({ id: authSession.id });
	return deleted.length;
}

/**
 * "Log out other devices": every session of the person except `keepSessionId`
 * (null = keep none, the Bearer caller's case), in one owner-scoped DELETE
 * where legacy looped one delete per row. Returns how many went.
 */
export async function deleteOtherSessions(
	db: Db,
	userId: string,
	keepSessionId: string | null
): Promise<number> {
	const owned = eq(authSession.userId, userId);
	const deleted = await db
		.delete(authSession)
		.where(keepSessionId === null ? owned : and(owned, ne(authSession.id, keepSessionId)))
		.returning({ id: authSession.id });
	return deleted.length;
}

// --- Personal API tokens ----------------------------------------------------

/** A new token row: the hash only, never the plaintext. */
export type NewApiTokenValues = {
	readonly userId: string;
	readonly name: string;
	readonly tokenHash: string;
};

/** Stores a token; answers its safe columns only (the hash stays in the row). */
export async function insertApiToken(
	db: Db,
	values: NewApiTokenValues,
	now: Date
): Promise<ApiTokenRecord> {
	const [record] = await db
		.insert(apiTokens)
		.values({ ...values, createdAt: now })
		.returning({ id: apiTokens.id, name: apiTokens.name, createdAt: apiTokens.createdAt });
	if (!record) throw new Error('insertApiToken: insert returned no row');
	return record;
}

/** The person's tokens, safe columns only. No ORDER BY today (Q-110 orders them after S6). */
export async function listApiTokensForPerson(db: Db, userId: string): Promise<ApiTokenListing[]> {
	return await db
		.select({
			id: apiTokens.id,
			name: apiTokens.name,
			createdAt: apiTokens.createdAt,
			lastUsedAt: apiTokens.lastUsedAt
		})
		.from(apiTokens)
		.where(eq(apiTokens.userId, userId));
}

/** Revoke one token, scoped to `(id, userId)`: a foreign or unknown id deletes nothing. */
export async function deleteApiToken(db: Db, userId: string, id: string): Promise<void> {
	await db.delete(apiTokens).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)));
}

/** Every token the person owns, the caller's own included (password reset). */
export async function deleteApiTokensForPerson(db: Db, userId: string): Promise<number> {
	const deleted = await db
		.delete(apiTokens)
		.where(eq(apiTokens.userId, userId))
		.returning({ id: apiTokens.id });
	return deleted.length;
}

/** Mobile logout: exactly the presented token (by hash), scoped to its owner. */
export async function deleteApiTokenByHash(
	db: Db,
	userId: string,
	tokenHash: string
): Promise<void> {
	await db
		.delete(apiTokens)
		.where(and(eq(apiTokens.tokenHash, tokenHash), eq(apiTokens.userId, userId)));
}

/** Who holds a token: its id and its owner's row, or null for an unknown hash. */
export type ApiTokenHolder = {
	readonly tokenId: string;
	readonly person: UserRow;
};

/**
 * The Bearer lookup: hash → token → owner, one inner join, so a token whose
 * owner is gone also answers null. The hash is matched, never returned.
 */
export async function findApiTokenHolder(
	db: Db,
	tokenHash: string
): Promise<ApiTokenHolder | null> {
	const [row] = await db
		.select()
		.from(apiTokens)
		.innerJoin(users, eq(users.id, apiTokens.userId))
		.where(eq(apiTokens.tokenHash, tokenHash));
	return row ? { tokenId: row.api_tokens.id, person: row.users } : null;
}

export async function touchApiTokenLastUsed(db: Db, id: string, now: Date): Promise<void> {
	await db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, id));
}

// --- Email codes ------------------------------------------------------------

/** Stores a code row exactly as given (`code` is the SHA-256 hex, every kind). */
export async function insertEmailCode(db: Db, values: NewCodeRow): Promise<CodeRow> {
	const [row] = await db.insert(codes).values(values).returning();
	if (!row) throw new Error('insertEmailCode: insert returned no row');
	return row;
}

/** The lookup: digest, email AND type must all match (#162, #154). */
export async function findEmailCodeByKey(db: Db, key: EmailCodeKey): Promise<CodeRow | null> {
	const [row] = await db.select().from(codes).where(matchesKey(key));
	return row ?? null;
}

export async function deleteEmailCodeByKey(db: Db, key: EmailCodeKey): Promise<void> {
	await db.delete(codes).where(matchesKey(key));
}

/** Every code bound to an address (a new email-change request replaces the old). */
export async function deleteEmailCodesForEmail(db: Db, email: string): Promise<void> {
	await db.delete(codes).where(eq(codes.email, email));
}

/** Codes that expired strictly before `now`. Returns how many went. */
export async function deleteExpiredEmailCodes(db: Db, now: Date): Promise<number> {
	const deleted = await db
		.delete(codes)
		.where(lt(codes.expiresAt, now))
		.returning({ code: codes.code });
	return deleted.length;
}

function matchesKey(key: EmailCodeKey) {
	return and(eq(codes.code, key.codeHash), eq(codes.email, key.email), eq(codes.type, key.type));
}

// --- Provider account bindings ----------------------------------------------

/** The binding for a provider account id (the email, for the email provider). */
export async function findAccountBinding(
	db: Db,
	providerAccountId: string
): Promise<AccountRow | null> {
	const [row] = await db
		.select()
		.from(accounts)
		.where(eq(accounts.providerAccountId, providerAccountId));
	return row ?? null;
}

export async function insertAccountBinding(
	db: Db,
	values: Pick<NewAccountRow, 'userId' | 'provider' | 'providerAccountId'>
): Promise<AccountRow> {
	const [row] = await db.insert(accounts).values(values).returning();
	if (!row) throw new Error('insertAccountBinding: insert returned no row');
	return row;
}
