/**
 * Identity tables: the user row, its settings, the credential/provider stores
 * (Better Auth sessions, accounts, verifications, email codes) and personal API
 * tokens.
 *
 * Definitions moved verbatim out of the legacy `src/lib/server/db/schema.ts`
 * (task K-04); `identity` owns them (scripts/arch/registry.mjs TABLE_OWNERS).
 * Ids come from the kernel id port, "now" from the kernel clock (rule R5).
 *
 * Doc: src/lib/kernel/README.md#database
 */
import { boolean, integer, json, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { systemIds } from '$lib/kernel/ids/ids';
import { systemClock } from '$lib/kernel/time/clock';
import { calendars } from './calendar.tables.server';

export const users = pgTable('users', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => systemIds.id()),
	firstName: text('firstName').notNull(),
	lastName: text('lastName').notNull(),
	email: text('email').unique(),
	passwordHash: text('passwordhash'),
	emailVerified: boolean('emailVerified'),
	picture: text('picture'),
	roles: json('roles').default([]).$type<string[]>().notNull(),
	createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
	lastActiveAt: timestamp('lastActiveAt', { mode: 'date', withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp('updatedAt', { mode: 'date' })
		.defaultNow()
		.$onUpdate(() => systemClock.now())
		.notNull(),
	phonenumber: text('phonenumber'),
	phonenumberVerified: boolean('phonenumberVerified'),
	lastLogin: timestamp('lastLogin', { mode: 'date' }).defaultNow().notNull(),
	// Receipt email ingest (#033): random token local-part of the user's
	// personal receipts.<token>@<RECEIPT_INGEST_DOMAIN> address. Null =
	// feature unused; unique when set.
	receiptIngestToken: text('receiptIngestToken')
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

export const userSettings = pgTable('userSettings', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => systemIds.id()),
	weekStart: text('weekStart').default('sunday'),
	timeZone: text('timeZone'),
	color: text('color'),
	syncEventsToFamilyCalendar: boolean(),
	// The ad gate (#088) — one field, one source of truth. Opt-in: no row, null
	// or false means no ads are served to this user.
	showAdsAsEvents: boolean().default(false),
	autoParseEventDetails: boolean().default(true),
	useCloudAI: boolean().default(true),
	useLocalAI: boolean().default(true),
	// Daily scripture verse card on the calendar dashboard (off by default).
	showDailyVerse: boolean('showDailyVerse').default(false),
	// Which translation the daily verse renders in. ESV is fetched via the
	// Crossway API; without a key, bundled public-domain text is served.
	verseTranslation: text('verseTranslation').default('esv'),
	// Dashboard modules this user has hidden on their own dashboard, e.g. ['board'].
	hiddenDashboardModules: text('hiddenDashboardModules').array(),
	updatedAt: timestamp('updatedAt', { mode: 'date' })
		.defaultNow()
		.$onUpdate(() => systemClock.now())
		.notNull(),
	defaultCalendarId: text('defaultCalendarId').references(() => calendars.id, {
		onDelete: 'set null'
	}),
	defaultView: text('defaultView').default('dayView'),
	userId: text('userId')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' })
});

export type UserSettingsRow = typeof userSettings.$inferSelect;
export type NewUserSettingsRow = typeof userSettings.$inferInsert;

export const accounts = pgTable(
	'accounts',
	{
		userId: text('userId')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// type: text("type").$type().notNull(),
		provider: text('provider').notNull(),
		providerAccountId: text('providerAccountId').notNull(),
		refresh_token: text('refresh_token'),
		access_token: text('access_token'),
		expires_at: integer('expires_at'),
		token_type: text('token_type'),
		scope: text('scope'),
		id_token: text('id_token'),
		session_state: text('session_state')
	},
	(account) => ({
		compoundKey: primaryKey({ columns: [account.provider, account.providerAccountId] })
	})
);

export type AccountRow = typeof accounts.$inferSelect;
export type NewAccountRow = typeof accounts.$inferInsert;

export const codes = pgTable('codes', {
	code: text('code').notNull().unique(),
	expiresAt: timestamp('expiresAt', { withTimezone: true, mode: 'date' }).notNull(),
	email: text('email').notNull(),
	firstName: text('firstName'),
	lastName: text('lastName'),
	emailId: text('emailId'),
	type: text('type').default('signup'),
	pendingEmail: text('pendingEmail')
});

export type CodeRow = typeof codes.$inferSelect;
export type NewCodeRow = typeof codes.$inferInsert;

/**
 * Better Auth session store (#196 slice 1). Replaces the lucia `sessions`
 * table (dropped, not migrated — sessions carry no user data; PITR is the
 * recovery path). Rows are minted/validated by `$lib/server/auth` using
 * better-auth's model: cookie value = URL-encoded `token.hmacSHA256(token)`,
 * lookup by `token`.
 */
export const authSession = pgTable('auth_session', {
	id: text('id').notNull().primaryKey(),
	token: text('token').notNull().unique(),
	userId: text('userId')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expiresAt', { withTimezone: true, mode: 'date' }).notNull(),
	ipAddress: text('ipAddress'),
	userAgent: text('userAgent'),
	createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
});

export type AuthSessionRow = typeof authSession.$inferSelect;
export type NewAuthSessionRow = typeof authSession.$inferInsert;

/**
 * Better Auth account store: one row per credential/provider binding. The
 * password account (`providerId: 'credential'`) carries `account.password` —
 * seeded from `users.passwordHash` by migration 018 (bcrypt kept; new hashes
 * stay bcrypt, no forced resets). MFA-ready for #176 (two-factor is a later
 * slice).
 */
export const authAccount = pgTable('auth_account', {
	id: text('id').notNull().primaryKey(),
	userId: text('userId')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	providerId: text('providerId').notNull(),
	accountId: text('accountId').notNull(),
	password: text('password'),
	createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
});

export type AuthAccountRow = typeof authAccount.$inferSelect;
export type NewAuthAccountRow = typeof authAccount.$inferInsert;

/**
 * Better Auth verification store — one-time tokens (email tokens replace the
 * `codes` table in slice B, ADR-0002 #6).
 */
export const authVerification = pgTable('auth_verification', {
	id: text('id').notNull().primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expiresAt', { withTimezone: true, mode: 'date' }).notNull(),
	createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
});

export type AuthVerificationRow = typeof authVerification.$inferSelect;
export type NewAuthVerificationRow = typeof authVerification.$inferInsert;

/**
 * Personal API tokens (TaskFocus Bearer auth). Only the SHA-256 hash is
 * stored — the plaintext (`fp_` + base64url) is shown once at creation
 * and never again. Tokens live until revoked; no expiry.
 */
export const apiTokens = pgTable('api_tokens', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => systemIds.id()),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	tokenHash: text('token_hash').notNull().unique(),
	lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export type ApiTokenRow = typeof apiTokens.$inferSelect;
export type NewApiTokenRow = typeof apiTokens.$inferInsert;
