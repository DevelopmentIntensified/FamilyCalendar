import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { resolveUnmatchedPhrase } from '$lib/server/db/actions/unmatchedPhrases';
import { isAdminUser, loadUnmatchedPhrases } from '$lib/server/services/adminData';

/** True for non-empty strings (form fields that must carry a value). */
function isNonEmptyString(v: unknown): v is string {
	return typeof v === 'string' && v.length > 0;
}

// Shared with GET /api/admin/nlp (#292 G19).
export const load: PageServerLoad = async ({ locals }) => {
	if (!isAdminUser(locals.user)) throw redirect(302, '/login');
	return await loadUnmatchedPhrases();
};

export const actions: Actions = {
	resolve: async ({ locals, request }) => {
		// Actions run before loads in SvelteKit, so this check cannot rely
		// on the (admin) layout's role enforcement.
		if (!isAdminUser(locals.user)) error(403, 'Forbidden');
		const form = await request.formData();
		const id = form.get('id');
		if (isNonEmptyString(id)) {
			await resolveUnmatchedPhrase(id);
		}
		return { success: true };
	}
};
