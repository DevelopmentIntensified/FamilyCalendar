/**
 * identity person rules: the ONE Anonymous Account predicate (and its
 * "registered" complement), the email a client may see, the person label,
 * the guest row, the profile privilege drop, the hourly Inactivity Window
 * touch and the stored-zone resolution.
 *
 * Isomorphic on purpose: client components share the exact definition the
 * server writes. "Now" is a parameter (R5).
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';

/**
 * Guests are user rows whose email is a generated placeholder at this
 * reserved domain (#196, the better-auth anonymous model).
 */
export const ANONYMOUS_EMAIL_DOMAIN = '@anonymous.placeholder.invalid';

/** The zone every sign-up path writes into the new settings row. */
export const SIGN_UP_TIME_ZONE = 'UTC';

/** `lastActiveAt` is written at most once per this interval. */
export const LAST_ACTIVE_TOUCH_MS = 60 * 60 * 1000;

type EmailHolder = { readonly email?: string | null };

/** True only for the placeholder domain, matched as a suffix. */
export function isAnonymousAccount(user: EmailHolder | null | undefined): boolean {
	return !!user?.email?.endsWith(ANONYMOUS_EMAIL_DOMAIN);
}

/**
 * Registered = a real (non-placeholder) email. Use this, never `user.email`
 * truthiness: since #196 a guest's email is always truthy.
 */
export function isRegisteredAccount<T extends EmailHolder>(
	user: T | null | undefined
): user is T & { readonly email: string } {
	return !!user?.email && !isAnonymousAccount(user);
}

/** The email a response may carry: a guest's placeholder (or no email) is `null`. */
export function guestSafeEmail(user: EmailHolder | null | undefined): string | null {
	return isRegisteredAccount(user) ? user.email : null;
}

/**
 * The person label: the names that are present, joined by one space, ends
 * trimmed; `null` when nothing is left (the caller picks its fallback).
 */
export function displayName(
	person: { readonly firstName?: string | null; readonly lastName?: string | null } | null | undefined
): string | null {
	return [person?.firstName, person?.lastName].filter(Boolean).join(' ').trim() || null;
}

/**
 * The STORED full name, untrimmed: `first + ' ' + last`, the exact string the
 * legacy SQL's `first || ' ' || last` put on the stats wire — an empty last
 * name keeps its trailing space (`'Sam '`). `displayName` is the label rule and
 * trims; the two are not interchangeable, so this one keeps the row shape.
 */
export function personFullName(person: {
	readonly firstName: string;
	readonly lastName: string;
}): string {
	return `${person.firstName} ${person.lastName}`;
}

/** The users row a new guest gets: an id-derived placeholder email, no roles. */
export type AnonymousPersonValues = {
	readonly id: string;
	readonly firstName: string;
	readonly lastName: string;
	readonly email: string;
	readonly emailVerified: boolean;
	readonly roles: string[];
};

/** The users row `createAnonymousAccount` writes for a new guest (`users.ts:121-140`). */
export function anonymousPersonValues(id: string): AnonymousPersonValues {
	return {
		id,
		firstName: 'Guest',
		lastName: '',
		email: `${id}${ANONYMOUS_EMAIL_DOMAIN}`,
		emailVerified: false,
		roles: []
	};
}

/** The only users columns the generic profile write may touch. */
export type ProfilePatch = { firstName?: string; lastName?: string };

/**
 * Keeps `firstName`/`lastName` (when defined) and drops everything else (#168):
 * `email`, `emailVerified`, `passwordHash` and `roles` each have their own
 * write, so mass assignment cannot reach them even through a cast.
 */
export function profilePatch(data: {
	readonly firstName?: string;
	readonly lastName?: string;
}): ProfilePatch {
	const patch: ProfilePatch = {};
	if (data.firstName !== undefined) patch.firstName = data.firstName;
	if (data.lastName !== undefined) patch.lastName = data.lastName;
	return patch;
}

/**
 * Whether an authenticated request should write `lastActiveAt` (the
 * Inactivity Window input): strictly more than an hour since the last touch,
 * and always when there is none (`src/hooks.server.ts:106-112`).
 */
export function touchDue(lastActiveAt: Date | null | undefined, now: Date): boolean {
	const last = lastActiveAt ? lastActiveAt.getTime() : 0;
	return now.getTime() - last > LAST_ACTIVE_TOUCH_MS;
}

/**
 * The stored zone when Luxon can resolve it, else `undefined` (= server-local,
 * a transitional fallback). Feeds every cursor pin (#214).
 *
 * Deliberately permissive, unlike `isIanaTimeZone` (Q-107): rows written
 * before that fix may hold `local`, `system`, `default` or `UTC+5`, and every
 * reader must resolve them exactly as before rather than dropping the zone.
 */
export function zoneFromStored(timeZone: string | null | undefined): string | undefined {
	if (!timeZone) return undefined;
	return DateTime.fromMillis(0).setZone(timeZone).isValid ? timeZone : undefined;
}
