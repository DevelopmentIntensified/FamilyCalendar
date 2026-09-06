import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getBugReportsWithReporter, resolveBugReport } from '$lib/server/db/actions/bugReports';

/** True for non-empty strings (form fields that must carry a value). */
function isNonEmptyString(v: unknown): v is string {
	return typeof v === 'string' && v.length > 0;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user?.roles?.includes('admin')) throw redirect(302, '/login');
	return {
		open: await getBugReportsWithReporter(false),
		resolved: await getBugReportsWithReporter(true)
	};
};

export const actions: Actions = {
	resolve: async ({ locals, request }) => {
		if (!locals.user?.roles?.includes('admin')) error(403, 'Forbidden');
		const form = await request.formData();
		const id = form.get('id');
		if (isNonEmptyString(id)) {
			await resolveBugReport(id);
		}
		return { success: true };
	}
};
