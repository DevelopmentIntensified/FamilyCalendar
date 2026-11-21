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
	touchDue,
	zoneFromStored
} from './identity.person.rules';
import {
	deletePersonRow,
	findPersonByEmail,
	findPersonById,
	findSettingsByPerson,
	insertPasswordCredential,
	insertPerson,
	insertSettings,
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

/** The sign-up and invite guards: is this address already an account? */
export async function isEmailTaken(ctx: Ctx, email: string): Promise<boolean> {
	return (await findPersonByEmail(ctx.db, email)) !== null;
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
