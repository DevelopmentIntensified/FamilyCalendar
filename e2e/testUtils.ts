/**
 * e2e — the single seam a Playwright worker uses to reach the v2 codebase.
 *
 * The browser drives the app over HTTP; this file is the *other* half of a
 * journey: it seeds the same rows the app would have (a verified person, their
 * Personal Calendar, a session, an emailed code) and asserts the rows the app
 * left behind. It is a test harness, not app code, so it owns one pooled
 * connection (`connectDb`, kernel) and the row builders, and every product
 * behaviour it needs comes from the modules' public server entries
 * (`$lib/domains/<module>/index.server`) — never from the legacy
 * `$lib/server` tree, which is deleted module by module.
 *
 * Two v2 facts shape the helpers below:
 * - a code in `codes.code` is `HMAC-SHA-256(EMAILSECRET, code)` (Q-116/Q-117),
 *   so a fabricated code must be written through identity's `issueEmailCode`
 *   and the plaintext kept by the caller (specs type it into the form);
 * - a session is an `auth_session` row plus better-auth's signed cookie, so
 *   minting one goes through identity's `startSession` with the SAME secret the
 *   running server resolved from the environment (`BETTER_AUTH_SECRET`).
 *
 * Doc: docs/architecture/testing.md
 */
import { test as base, type Page } from '@playwright/test';
import { and, desc, eq } from 'drizzle-orm';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { connectDb, type Db } from '$lib/kernel/db/database.server';
import {
	accounts,
	authSession,
	calendars,
	codes,
	eventAttendance,
	events,
	families,
	familyMembers,
	subscriptions,
	taskCompletions,
	tasks,
	users,
	userSettings
} from '$lib/kernel/db/tables.server';
import { systemIds } from '$lib/kernel/ids/ids';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { systemClock } from '$lib/kernel/time/clock';
import {
	SESSION_COOKIE_NAME,
	createEmailPerson,
	discardEmailCodes,
	getPersonByEmail,
	issueEmailCode,
	resolveCodePepper,
	resolveSessionSecret,
	startSession,
	type SessionCookie
} from '$lib/domains/identity/index.server';
import { ensurePersonalCalendar } from '$lib/domains/calendar/index.server';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error('DATABASE_URL is not set — e2e reads it from .env.local via playwright.config.ts');
}

/** The pool every helper below shares; `closeSessionDb()` ends it. */
const handle = connectDb(databaseUrl);

/** Direct row access for seeding and assertions (the harness's own DB). */
export const db: Db = handle.db;

/**
 * A real Ctx over that pool: the app's own clock and id generator (ids must be
 * unique across parallel workers), and the secrets the running server resolved
 * from the same environment, so the sessions and codes it mints validate there.
 */
const ctx: Ctx = {
	...testCtx({
		db,
		sessionSecret: resolveSessionSecret(process.env.BETTER_AUTH_SECRET, false),
		codePepper: resolveCodePepper(process.env.EMAILSECRET, false)
	}),
	clock: systemClock,
	ids: systemIds
};

/**
 * Identity's session cookie name (`better-auth.session_token`): what a journey
 * checks for after a sign-in. Legacy read `auth_session` (the lucia cookie).
 */
export const SESSION_COOKIE = SESSION_COOKIE_NAME;

/** Re-exported so a spec's row assertions stay a single import line. */
export {
	accounts,
	authSession,
	calendars,
	codes,
	eq,
	eventAttendance,
	events,
	families,
	familyMembers,
	taskCompletions,
	tasks,
	users,
	userSettings
};

export interface TestUser {
	email: string;
	firstName: string;
	lastName: string;
	uid: string;
}

// --- People -------------------------------------------------------------------

/**
 * The legacy `createNewUser.ts:8-32`: a verified person with their `email`
 * provider binding, a settings row and their Personal Calendar. Two v2 calls,
 * each the module's own seam (`identity.createEmailPerson`,
 * `calendar.ensurePersonalCalendar`).
 */
export async function createNewUser(firstName: string, lastName: string, email: string) {
	const person = await createEmailPerson(ctx, { email, firstName, lastName });
	await ensurePersonalCalendar(ctx, person.id);
	return person;
}

/** One person row by id, or `undefined` when gone (the shape specs assert on). */
export async function getUser(id: string) {
	const [row] = await db.select().from(users).where(eq(users.id, id));
	return row;
}

export async function getUserByEmail(email: string) {
	const [row] = await db.select().from(users).where(eq(users.email, email));
	return row;
}

/** One `accounts` binding by provider account id (the legacy `getAccount`). */
export async function getAccount(providerAccountId: string) {
	const [row] = await db
		.select()
		.from(accounts)
		.where(eq(accounts.providerAccountId, providerAccountId));
	return row;
}

/** Drop the provider binding for an address (the legacy `deleteAccount`). */
export async function deleteAccount(providerAccountId: string) {
	await db.delete(accounts).where(eq(accounts.providerAccountId, providerAccountId));
}

/**
 * Delete the person and the rows that do not cascade: the legacy
 * `deleteUser` composition (`assignments` cleared first, then the
 * non-cascading subscription rows).
 */
export async function deleteUser(id: string) {
	await db.transaction(async (tx) => {
		await tx.update(tasks).set({ assignmentStatus: 'none' }).where(eq(tasks.assignedTo, id));
		await tx.delete(subscriptions).where(eq(subscriptions.userId, id));
		await tx.delete(users).where(eq(users.id, id));
	});
}

export async function deleteUserByEmail(email: string) {
	await db.delete(users).where(eq(users.email, email));
}

// --- Sessions -----------------------------------------------------------------

/** A live session row for the person: the extra-session cases seed these. */
export async function createExtraSession(userId: string) {
	const { session } = await startSession(ctx, userId);
	return session;
}

function sessionCookieFor(page: Page, cookie: SessionCookie) {
	return page.context().addCookies([
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

/** The signed session cookie for one address (the legacy `createSessionCookie`). */
export async function getSessionCookie(email: string) {
	const person = await getPersonByEmail(ctx, email);
	if (!person) throw new Error('User not found');
	const { cookie } = await startSession(ctx, person.id);
	return cookie;
}

/** Sign the page's browser in as the person behind `email`. */
export async function loginWithSession(page: Page, email: string) {
	await sessionCookieFor(page, await getSessionCookie(email));
}

/** Sign the page's browser in as the person with this id (family journeys hold ids). */
export async function loginWithUserIdSession(page: Page, userId: string) {
	const { cookie } = await startSession(ctx, userId);
	await sessionCookieFor(page, cookie);
}

// --- Emailed codes ------------------------------------------------------------

export type CreateCodeInput = {
	readonly code: string;
	readonly email: string;
	readonly expiresAt?: Date;
	readonly firstName?: string | null;
	readonly lastName?: string | null;
	readonly emailId?: string | null;
	/** Defaults to `signup`, the `codes.type` column default. */
	readonly type?: string;
	readonly pendingEmail?: string | null;
};

/**
 * Store one code the way the app does: `issueEmailCode` keeps only the keyed
 * digest, so the caller must keep the plaintext it passed in.
 */
export async function createCode(input: CreateCodeInput) {
	return await issueEmailCode(ctx, {
		code: input.code,
		email: input.email,
		type: input.type ?? 'signup',
		firstName: input.firstName ?? null,
		lastName: input.lastName ?? null,
		emailId: input.emailId ?? null,
		pendingEmail: input.pendingEmail ?? null,
		expiresAt: input.expiresAt
	});
}

/** Every code bound to an address, newest expiry first (the legacy read). */
export async function getCodesByEmail(email: string) {
	return await db.select().from(codes).where(eq(codes.email, email)).orderBy(desc(codes.expiresAt));
}

export async function deleteCodesByEmail(email: string) {
	await discardEmailCodes(ctx, email);
}

/**
 * Mint a code the app can redeem and hand back its plaintext — what a journey
 * types into the form, since the database only keeps the digest.
 */
export async function createVerificationCode(
	email: string,
	firstName: string,
	lastName: string,
	type = 'signup',
	pendingEmail: string | null = null
): Promise<string> {
	const code = Math.random().toString(36).substring(2, 10).toUpperCase();
	await createCode({ code, email, firstName, lastName, emailId: 'test-email-id', type, pendingEmail });
	return code;
}

// --- Calendar -----------------------------------------------------------------

/** The first calendar the person owns — their Personal Calendar (legacy read). */
export async function getUserCalendar(userId: string) {
	const rows = await db.select().from(calendars).where(eq(calendars.ownerId, userId));
	return rows[0] ?? null;
}

/** One event row by id, or `undefined` when gone. */
export async function getEvent(id: string) {
	const [row] = await db.select().from(events).where(eq(events.id, id));
	return row;
}

/**
 * Seed an event exactly as the legacy action did: the row, plus the creator's
 * auto-RSVP ("going"), in one transaction. `ownerId` defaults to the row's.
 */
export async function createEvent(data: typeof events.$inferInsert, ownerId?: string) {
	return await db.transaction(async (tx) => {
		const [created] = await tx.insert(events).values(data).returning();
		const attendee = ownerId ?? created.ownerId;
		if (created && attendee) {
			await tx.insert(eventAttendance).values({
				eventId: created.id,
				userId: attendee,
				status: 'going',
				inviteType: 'optional'
			});
		}
		return created;
	});
}

// --- Family -------------------------------------------------------------------

/**
 * A family row plus its family calendar — the legacy `createFamily` action,
 * with no membership (the journey seeds the roles it wants).
 */
export async function createFamily(data: { name: string; color?: string | null; id?: string }) {
	const [family] = await db.insert(families).values(data).returning();
	await db.insert(calendars).values({ familyId: family.id });
	return family;
}

/** The legacy `removeFamilyMember`: clear the member's Family Tasks, then the roster row. */
export async function removeFamilyMember(familyId: string, userId: string) {
	await db.transaction(async (tx) => {
		await tx
			.update(tasks)
			.set({ assignedTo: null, assignmentStatus: 'none' })
			.where(eq(tasks.familyId, familyId));
		await tx
			.delete(familyMembers)
			.where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)));
	});
}

// --- Fixtures -----------------------------------------------------------------

export async function setupTestUser(overrides?: Partial<TestUser>): Promise<TestUser> {
	const timestamp = Date.now() + Math.floor(Math.random() * 10000);
	const firstName = overrides?.firstName || 'test';
	const lastName = overrides?.lastName || 'user';
	const email = overrides?.email || `delivered+${firstName}${lastName}${timestamp}@resend.dev`;

	const person = await createNewUser(firstName, lastName, email);

	return {
		email,
		firstName,
		lastName,
		uid: person.id
	};
}

/**
 * Remove the person and every row a journey can attach to them, in the legacy
 * teardown order (children before the `users` row). A person the app already
 * deleted is a no-op, so it is safe in `afterEach` after an account-deletion
 * journey.
 */
export async function teardownTestUser(testUser: { email: string }) {
	const person = await getPersonByEmail(ctx, testUser.email);
	if (person) {
		const id = person.id;
		await db.transaction(async (tx) => {
			await tx.delete(events).where(eq(events.ownerId, id));
			await tx.delete(calendars).where(eq(calendars.ownerId, id));
			await tx.delete(familyMembers).where(eq(familyMembers.userId, id));
			await tx.delete(subscriptions).where(eq(subscriptions.userId, id));
			await tx.delete(userSettings).where(eq(userSettings.userId, id));
			await tx.delete(authSession).where(eq(authSession.userId, id));
			await tx.delete(accounts).where(eq(accounts.userId, id));
			await tx.update(tasks).set({ assignmentStatus: 'none' }).where(eq(tasks.assignedTo, id));
			await tx.delete(users).where(eq(users.id, id));
		});
	}
	await discardEmailCodes(ctx, testUser.email);
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

/**
 * End the pool the helpers above run on. A Playwright worker that used them
 * must call this before it is done or the open socket keeps the process alive;
 * test files call it from `test.afterAll`.
 */
export async function closeSessionDb(): Promise<void> {
	await handle.close();
}
