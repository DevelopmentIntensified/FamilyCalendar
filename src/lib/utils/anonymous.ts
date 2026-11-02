/**
 * Anonymous Account marker (#196 slice 1): guests are user rows whose email
 * is a generated placeholder at this reserved domain — the better-auth
 * anonymous-plugin model (no real email, `emailVerified: false`, upgrade to a
 * real account on login). This ONE predicate replaces the drifted
 * `email === null` checks that used to live in the hooks, login routes,
 * merge-guest page, guest-merge service and the cron cleanup.
 *
 * Lives in `$lib/utils` (isomorphic) so client components share the exact
 * same definition the server writes.
 */
export const ANONYMOUS_EMAIL_DOMAIN = '@anonymous.placeholder.invalid';

export function isAnonymousAccount(user: { email?: string | null } | null | undefined): boolean {
	return !!user?.email?.endsWith(ANONYMOUS_EMAIL_DOMAIN);
}

/**
 * Registered = signed-in user with a real (non-placeholder) email. Use this —
 * never `user.email` truthiness — for "already claimed / registered" checks:
 * since #196 guests carry a placeholder email, so truthiness is always true.
 */
export function isRegisteredAccount<T extends { email?: string | null }>(
	user: T | null | undefined
): user is T & { email: string } {
	return !!user?.email && !isAnonymousAccount(user);
}
