/**
 * Admin pages' data (#292 G19): the (admin) layout's role check and badge
 * counts, and the bug-report / unmatched-phrase registers, shared by the
 * /admin pages and the `/api/admin/**` JSON endpoints.
 */
import { countOpenBugReports, getBugReportsWithReporter } from '$lib/server/db/actions/bugReports';
import {
	countOpenUnmatchedPhrases,
	getUnmatchedPhrases
} from '$lib/server/db/actions/unmatchedPhrases';
import { guard } from '$lib/server/utils/guard';
import { json } from '@sveltejs/kit';
import { requireUserJson, type JsonAuthGuard } from '$lib/server/utils/requireUser';

/** THE admin check: the `admin` role on the user row (the layout's rule). */
export function isAdminUser(user: { roles?: string[] | null } | null | undefined): boolean {
	return !!user?.roles?.includes('admin');
}

/**
 * For `/api/admin/**`: 401 without a user, `403 {"error":"Forbidden"}` for a
 * signed-in non-admin (Bearer or cookie), else the admin user.
 */
export function requireAdminJson(locals: App.Locals): JsonAuthGuard {
	const auth = requireUserJson(locals);
	if (auth.response) return auth;
	if (!isAdminUser(auth.user)) {
		return { response: json({ error: 'Forbidden' }, { status: 403 }) };
	}
	return auth;
}

/** Nav badge counts; each degrades to 0 rather than failing the page. */
export async function loadAdminCounts() {
	const [bugs, phrases] = await Promise.all([
		guard('admin-counts', 0, () => countOpenBugReports()),
		guard('admin-counts', 0, () => countOpenUnmatchedPhrases())
	]);
	return { openBugs: bugs.data, openPhrases: phrases.data };
}

export async function loadBugReports() {
	return {
		open: await getBugReportsWithReporter(false),
		resolved: await getBugReportsWithReporter(true)
	};
}

export async function loadUnmatchedPhrases() {
	return {
		phrases: await getUnmatchedPhrases(false),
		resolved: await getUnmatchedPhrases(true)
	};
}
