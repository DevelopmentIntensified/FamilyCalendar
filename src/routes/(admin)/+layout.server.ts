import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { countOpenBugReports } from '$lib/server/db/actions/bugReports';
import { countOpenUnmatchedPhrases } from '$lib/server/db/actions/unmatchedPhrases';
import { guard } from '$lib/server/utils/guard';

export const load: LayoutServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	if (!event.locals.user.roles?.includes('admin')) {
		return redirect(302, '/calendar');
	}
	// Nav badge counts degrade to 0 rather than 500ing every admin page.
	const [bugs, phrases] = await Promise.all([
		guard('admin-counts', 0, () => countOpenBugReports()),
		guard('admin-counts', 0, () => countOpenUnmatchedPhrases())
	]);
	return { openBugs: bugs.data, openPhrases: phrases.data };
};
