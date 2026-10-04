import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Issue 124 — this path used to be a second, near-copy family-tasks board.
 *
 * It was never the approved one (`/family/tasks` is, since issue 101) and it
 * threw a ReferenceError on load: the page called `firstName(...)`, a name
 * defined nowhere in the file, four times while rendering task rows. The
 * family detail page linked straight to it, so the crash was reachable from a
 * shipped page.
 *
 * The page is deleted rather than fixed — a second board cannot be correct,
 * only differently wrong (issue 101 records the shape the first one settled
 * on). What is left is the redirect, so a bookmark or an old link lands on the
 * real board instead of on a 404.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// 308: the target is permanent. The old path is not coming back.
	throw redirect(308, '/family/tasks');
};
