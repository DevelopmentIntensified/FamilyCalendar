import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
	getUnmatchedPhrases,
	resolveUnmatchedPhrase
} from '$lib/server/db/actions/unmatchedPhrases';

/** True for non-empty strings (form fields that must carry a value). */
function isNonEmptyString(v: unknown): v is string {
	return typeof v === 'string' && v.length > 0;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user?.roles?.includes('admin')) throw redirect(302, '/login');
	return {
		phrases: await getUnmatchedPhrases(false),
		resolved: await getUnmatchedPhrases(true)
	};
};

export const actions: Actions = {
	resolve: async ({ locals, request }) => {
		// Actions run before loads in SvelteKit, so this check cannot rely
		// on the (admin) layout's role enforcement.
		if (!locals.user?.roles?.includes('admin')) error(403, 'Forbidden');
		const form = await request.formData();
		const id = form.get('id');
		if (isNonEmptyString(id)) {
			await resolveUnmatchedPhrase(id);
		}
		return { success: true };
	}
};
