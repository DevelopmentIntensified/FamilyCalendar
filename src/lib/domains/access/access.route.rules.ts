/**
 * access route rules: which request paths the session pipeline gates, moved
 * verbatim out of legacy `src/hooks.server.ts` (`adminProtectedRoutes` /
 * `protectedRoutes`, `matchesRoute`, `isAdminRoute`).
 *
 * Matching is by path SEGMENT, not substring: `/disclaimer` must never match
 * `claim`, and a path that merely contains `calendar` (a share link, say) must
 * not match either. Nothing here reads the clock or the environment.
 *
 * `isProtectedRoute` is also what decides where an Anonymous Account may be
 * created (identity's `shouldCreateAnonymousAccount`); `isAdminRoute` is the
 * site-admin gate the pipeline runs before that fallback.
 *
 * Doc: ./README.md#invariants
 */

/** The site-admin pages (`src/hooks.server.ts:23`). */
const ADMIN_SEGMENTS = ['admin'];

/** The pages that need a person: `calendar`, `account`, `claim` and admin (`:24`). */
const PROTECTED_SEGMENTS = ['calendar', 'account', 'claim', ...ADMIN_SEGMENTS];

/** Segment-based match: true when any segment of `pathname` is one of `routes`. */
function matchesRoute(pathname: string, routes: readonly string[]): boolean {
	const segments = pathname.split('/');
	for (const route of routes) {
		if (segments.includes(route)) return true;
	}
	return false;
}

/** True for a path with an `admin` segment — every one of them is admin-only. */
export function isAdminRoute(pathname: string): boolean {
	return matchesRoute(pathname, ADMIN_SEGMENTS);
}

/** True for a path with a `calendar`, `account`, `claim` or `admin` segment. */
export function isProtectedRoute(pathname: string): boolean {
	return matchesRoute(pathname, PROTECTED_SEGMENTS);
}
