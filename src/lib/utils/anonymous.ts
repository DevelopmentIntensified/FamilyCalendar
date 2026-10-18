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
