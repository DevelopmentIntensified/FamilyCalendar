/**
 * identity person service: the caller's own person, the sign-up/child-door
 * reads and creation, the profile write, the Anonymous Account row, the hourly
 * Inactivity Window touch, the stored zone and the users-row delete.
 *
 * Authorization lives here: every function that acts on "me" takes the
 * caller's `Actor` and reads/writes only that person (no other id is
 * accepted); the lookups and creation take no actor because their callers
 * (sign-up, family's child/invite doors) have already decided who may ask.
 * Time comes from `ctx.clock`, ids from `ctx.ids`; expected failures are
 * `AppError`s with the legacy copy. Two-row writes (`createPersonWithPassword`,
 * `createAnonymousAccount`) run in ONE transaction.
 *
 * Doc: ./README.md#public-interface
 */
import { encodeHexLowerCase } from '@oslojs/encoding';
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { withTx } from '$lib/kernel/db/database.server';
import { invalid, notFound } from '$lib/kernel/errors/appError';
import type { UserRow } from '$lib/kernel/db/tables.server';
import type { PersonView } from './identity.contract';
import { PROFILE_NAMES_REQUIRED_MESSAGE } from './identity.contract';
import {
	anonymousPersonValues,
	guestSafeEmail,
	isAnonymousAccount,
	SIGN_UP_TIME_ZONE,
	touchDue
} from './identity.person.rules';
import { zoneFromStored } from './identity.zone.rules';
import {
	claimPersonEmail as claimPersonEmailRow,
	deletePersonRow,
	findAccountBinding,
	findPersonByEmail,
	findPersonById,
	findSettingsByPerson,
	insertAccountBinding,
	insertPasswordCredential,
	insertPerson,
	insertSettings,
	listPersonNamesByIds,
	listStaleAnonymousPeople,
	markPersonEmailVerified as markPersonEmailVerifiedRow,
	setPersonPasswordHash as setPersonPasswordHashRow,
	touchPersonLastActive,
	updatePersonNames
} from './identity.repo.server';
import { hashPassword } from './identity.credentials.service.server';

/** The profile write's input: both names are required, and nothing else is read. */
export type ProfileInput = {
	readonly firstName: string;
	readonly lastName: string;
};

/**
 * A person the sign-up or child door creates. `password` is optional because
 * the child door creates a real, passwordless account (legacy `createUser`):
 * with a password the `users.passwordHash` column AND the better-auth
 * `auth_account` credential row are written in one transaction; without one
 * only the user row is.
 */
export type CreatePersonWithPasswordInput = {
	readonly email: string;
	readonly firstName: string;
	readonly lastName: string;
	readonly password?: string;
	readonly emailVerified?: boolean;
	readonly roles?: string[];
};

/** Exact, case-sensitive match; a miss is null. */
export async function getPersonByEmail(ctx: Ctx, email: string): Promise<UserRow | null> {
	return await findPersonByEmail(ctx.db, email);
}

/**
 * One person row by id, raw (the placeholder email included): the read access'
 * account flows make after proving the caller with a session, a code or a
 * signed token. A miss is null, never a thrown 404.
 */
export async function getPersonById(ctx: Ctx, personId: string): Promise<UserRow | null> {
	return await findPersonById(ctx.db, personId);
}

/** The sign-up and invite guards: is this address already an account? */
export async function isEmailTaken(ctx: Ctx, email: string): Promise<boolean> {
	return (await findPersonByEmail(ctx.db, email)) !== null;
}

/** One person's stored names, as the id-batch read answers them. */
export type PersonName = {
	readonly id: string;
	readonly firstName: string;
	readonly lastName: string;
};

/**
 * Names for the ids a caller already holds (tasks' stats figures and its
 * assignee/creator fields). Actor-free on purpose: every caller passes ids of
 * rows it has already scoped, and the read answers nothing else. Unknown ids
 * are simply absent and the order is not claimed.
 */
export async function listPersonNames(
	ctx: Ctx,
	ids: readonly string[]
): Promise<PersonName[]> {
	return await listPersonNamesByIds(ctx.db, ids);
}

/** The caller's own person; a missing row is an expected 404, never a silent null. */
export async function getPerson(ctx: Ctx, actor: Actor): Promise<PersonView> {
	const row = await findPersonById(ctx.db, actor.id);
	if (!row) throw notFound('Person not found');
	return personView(row);
}

/**
 * Trims and writes `firstName`/`lastName` only (`profilePatch` drops every
 * privilege field at runtime). Blank names keep the legacy 400 copy.
 */
export async function updatePersonProfile(
	ctx: Ctx,
	actor: Actor,
	input: ProfileInput
): Promise<PersonView> {
	const firstName = input.firstName.trim();
	const lastName = input.lastName.trim();
	if (!firstName || !lastName) throw invalid(PROFILE_NAMES_REQUIRED_MESSAGE);
	const row = await updatePersonNames(
		ctx.db,
		actor.id,
		{ firstName, lastName },
		ctx.clock.now()
	);
	if (!row) throw notFound('Person not found');
	return personView(row);
}

/**
 * One person row, plus its credential row and bcrypt hash when a password is
 * given — the two writes share a transaction, so a failed account insert never
 * strands a user without credentials. Ids from `ctx.ids`, stamps from
 * `ctx.clock`.
 */
export async function createPersonWithPassword(
	ctx: Ctx,
	input: CreatePersonWithPasswordInput
): Promise<UserRow> {
	const passwordHash = input.password ? await hashPassword(input.password) : null;
	return await withTx(ctx, async (txCtx) => {
		const now = txCtx.clock.now();
		const person = await insertPerson(
			txCtx.db,
			{
				id: txCtx.ids.id(),
				email: input.email,
				firstName: input.firstName,
				lastName: input.lastName,
				emailVerified: input.emailVerified ?? false,
				roles: input.roles ?? [],
				...(passwordHash ? { passwordHash } : {})
			},
			now
		);
		if (passwordHash) {
			await insertPasswordCredential(txCtx.db, person.id, passwordHash, now);
		}
		return person;
	});
}

/** The magic-link / mobile sign-up person: what its two doors collect. */
export type CreateEmailPersonInput = {
	readonly email: string;
	readonly firstName: string;
	readonly lastName: string;
};

/**
 * The email-verified sign-up person (legacy `createNewUser.ts:8-32`): the users
 * row, its `email` provider binding and a random-colour settings row in ONE
 * transaction. The personal calendar is the caller's composition — calendar
 * owns `calendars`.
 */
export async function createEmailPerson(
	ctx: Ctx,
	input: CreateEmailPersonInput
): Promise<UserRow> {
	return await withTx(ctx, async (txCtx) => {
		const now = txCtx.clock.now();
		const person = await insertPerson(
			txCtx.db,
			{
				id: txCtx.ids.id(),
				email: input.email,
				firstName: input.firstName,
				lastName: input.lastName,
				emailVerified: true,
				roles: []
			},
			now
		);
		await insertAccountBinding(txCtx.db, {
			userId: person.id,
			provider: 'email',
			providerAccountId: input.email
		});
		// falso's legacy `randHex()`: `#` plus up to six lowercase hex digits.
		await insertSettings(
			txCtx.db,
			{ userId: person.id, color: `#${encodeHexLowerCase(txCtx.ids.random(3))}` },
			now
		);
		return person;
	});
}

/**
 * What an email sign-in resolves to. `bound` says an `accounts` row exists for
 * the address — sign-up suppresses on it even when its person row is gone,
 * exactly as the legacy `getAccount(email) || getUserByEmail(email)` did.
 */
export type SignInPersonLookup = {
	readonly bound: boolean;
	readonly person: UserRow | null;
};

/**
 * The person an email sign-in resolves to, in the legacy order: the `email`
 * provider binding first (`getAccount(email)` → `getUser(account.userId)`), the
 * `users` row by address only when there is no binding. A binding whose person
 * row is gone answers `{bound:true, person:null}` — it never falls back to the
 * address, because the legacy doors did not.
 */
export async function findPersonForSignIn(
	ctx: Ctx,
	email: string
): Promise<SignInPersonLookup> {
	const binding = await findAccountBinding(ctx.db, email);
	if (binding) return { bound: true, person: await findPersonById(ctx.db, binding.userId) };
	return { bound: false, person: await findPersonByEmail(ctx.db, email) };
}

/**
 * The sparse settings row every sign-in writes when none exists:
 * `timeZone: 'UTC'`, the legacy `createUserSettings({userId, timeZone:'UTC'})`
 * in the Android password door and the Claim backfill. Idempotent.
 */
export async function ensurePersonSettings(ctx: Ctx, userId: string): Promise<void> {
	if (await findSettingsByPerson(ctx.db, userId)) return;
	await insertSettings(ctx.db, { userId, timeZone: SIGN_UP_TIME_ZONE }, ctx.clock.now());
}

/**
 * One Anonymous Account: the id-derived placeholder email, `Guest`, no roles,
 * plus the `timeZone:'UTC'` settings row every sign-up path writes, in one
 * transaction. The "document navigation only" gate is the caller's (`app`
 * hooks), not this use-case's.
 */
export async function createAnonymousAccount(ctx: Ctx): Promise<UserRow> {
	const id = ctx.ids.id();
	const values = anonymousPersonValues(id);
	return await withTx(ctx, async (txCtx) => {
		const person = await insertPerson(txCtx.db, values, txCtx.clock.now());
		await insertSettings(
			txCtx.db,
			{ userId: person.id, timeZone: SIGN_UP_TIME_ZONE },
			txCtx.clock.now()
		);
		return person;
	});
}

/**
 * The Inactivity Window input: writes `lastActiveAt` only when more than an
 * hour has passed (or it was never set). Returns whether a write happened.
 */
export async function touchLastActive(ctx: Ctx, actor: Actor): Promise<boolean> {
	const row = await findPersonById(ctx.db, actor.id);
	if (!row || !touchDue(row.lastActiveAt, ctx.clock.now())) return false;
	await touchPersonLastActive(ctx.db, row.id, ctx.clock.now());
	return true;
}

/**
 * The stored zone as Luxon resolves it: a real zone or a legacy pseudo-zone
 * (`local`, `UTC+5`, …) passes; invalid or missing is `undefined`
 * (server-local). Every cursor pin reads this (#214).
 */
export async function getTimeZone(ctx: Ctx, userId: string): Promise<string | undefined> {
	const settings = await findSettingsByPerson(ctx.db, userId);
	return zoneFromStored(settings?.timeZone);
}

/**
 * Deletes the users row; sessions, settings, tokens and credential rows
 * cascade. Other modules' rows (the non-cascading `subscriptions`, task
 * assignment) are the account screen's deletion composition, in the same
 * transaction — identity writes no other module's table.
 */
export async function deletePerson(ctx: Ctx, actor: Actor): Promise<boolean> {
	return await deletePersonRow(ctx.db, actor.id);
}

/**
 * Retention: Anonymous Accounts idle since strictly before `cutoff` are
 * deleted, one row at a time; a delete that throws is logged and the rest of
 * the batch still goes (the legacy cron's per-user try/catch). `scanned`
 * counts the rows the cutoff matched, `deleted` the deletes that did not
 * throw. `app`'s cleanup cron computes the 90-day cutoff and passes it.
 *
 * Guests never bill and never hold a task assignment, so the legacy
 * `deleteUser`'s two cross-module steps (subscription rows, the cleared
 * assignment status) are no-ops for this population and stay the account
 * screen's composition — identity writes no other module's table.
 */
export async function pruneInactiveAnonymousAccounts(
	ctx: Ctx,
	cutoff: Date
): Promise<{ scanned: number; deleted: number }> {
	const stale = await listStaleAnonymousPeople(ctx.db, cutoff);
	let deleted = 0;
	for (const person of stale) {
		try {
			await deletePersonRow(ctx.db, person.id);
			deleted++;
		} catch (error) {
			ctx.log.error('anonymous_prune_failed', {
				userId: person.id,
				message: error instanceof Error ? error.message : String(error)
			});
		}
	}
	return { scanned: stale.length, deleted };
}

/**
 * Flips `emailVerified` for the person a redeemed code was minted for (access'
 * password-signup verify flow). Takes the id, not an Actor, because the caller
 * proved ownership with the code itself; a missing row answers `false`.
 */
export async function verifyPersonEmail(ctx: Ctx, personId: string): Promise<boolean> {
	const row = await markPersonEmailVerifiedRow(ctx.db, personId, ctx.clock.now());
	return row !== null;
}

/**
 * Applies a verified email change: the caller's own row gets the NEW address
 * already verified (`claimPersonEmail`'s write). The caller decided the address
 * — access checks the pending code, its binding and the unique-email guard
 * before this; the Actor scopes the write to the caller (no other id is read).
 */
export async function setPersonEmail(
	ctx: Ctx,
	actor: Actor,
	input: { readonly email: string }
): Promise<void> {
	await claimPersonEmailRow(ctx.db, actor.id, input.email, ctx.clock.now());
}

/**
 * Replaces `users.passwordHash` with the bcrypt hash of `password` — access'
 * reset, after it verified the signed token for this person. Never touches the
 * `auth_account` credential column (Q-104). Takes the id because reset's caller
 * has no session: the token is the proof.
 */
export async function setPersonPassword(
	ctx: Ctx,
	personId: string,
	input: { readonly password: string }
): Promise<boolean> {
	const passwordHash = await hashPassword(input.password);
	const row = await setPersonPasswordHashRow(ctx.db, personId, passwordHash, ctx.clock.now());
	return row !== null;
}

function personView(row: UserRow): PersonView {
	return {
		id: row.id,
		firstName: row.firstName,
		lastName: row.lastName,
		// The guest placeholder email never leaves the server.
		email: guestSafeEmail(row),
		emailVerified: row.emailVerified,
		isAnonymous: isAnonymousAccount(row),
		roles: row.roles,
		lastActiveAt: row.lastActiveAt
	};
}
