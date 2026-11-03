import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolveBugReport } from '$lib/server/db/actions/bugReports';
import { isAdminUser, loadBugReports } from '$lib/server/services/adminData';

/** True for non-empty strings (form fields that must carry a value). */
function isNonEmptyString(v: unknown): v is string {
	return typeof v === 'string' && v.length > 0;
}

// Shared with GET /api/admin/bugs (#292 G19).
export const load: PageServerLoad = async ({ locals }) => {
	if (!isAdminUser(locals.user)) throw redirect(302, '/login');
	return await loadBugReports();
};

export const actions: Actions = {
	resolve: async ({ locals, request }) => {
		if (!isAdminUser(locals.user)) error(403, 'Forbidden');
		const form = await request.formData();
		const id = form.get('id');
		if (isNonEmptyString(id)) {
			await resolveBugReport(id);
		}
		return { success: true };
	}
};
