import type { PageServerLoad, Actions } from './$types';
import { getUnmatchedPhrases, resolveUnmatchedPhrase } from '$lib/server/db/actions/unmatchedPhrases';

export const load: PageServerLoad = async () => {
	return {
		phrases: await getUnmatchedPhrases(false),
		resolved: await getUnmatchedPhrases(true)
	};
};

export const actions: Actions = {
	resolve: async ({ request }) => {
		const form = await request.formData();
		const id = form.get('id');
		if (typeof id === 'string' && id) {
			await resolveUnmatchedPhrase(id);
		}
		return { success: true };
	}
};
