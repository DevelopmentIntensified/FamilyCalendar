import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createBugReport, BUG_AREAS, type BugArea } from '$lib/server/db/actions/bugReports';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	return { areas: [...BUG_AREAS] };
};

export const actions: Actions = {
	submit: async ({ locals, request, url }) => {
		if (!locals.user) return fail(401, { error: 'Please log in to report a bug.' });

		const form = await request.formData();
		const area = String(form.get('area') ?? '');
		const description = String(form.get('description') ?? '').trim();
		const referer = request.headers.get('referer') ?? '';

		if (!(BUG_AREAS as readonly string[]).includes(area)) {
			return fail(400, { error: 'Please choose a category.', area, description });
		}
		if (!description) {
			return fail(400, { error: 'Please describe the bug.', area, description });
		}
		if (description.length > 5000) {
			return fail(400, {
				error: 'Description is too long (max 5000 characters).',
				area,
				description
			});
		}

		const row = await createBugReport({
			userId: locals.user.id,
			area: area as BugArea,
			description,
			url: referer || url.pathname
		});
		if (!row) {
			return fail(500, {
				error: 'Could not save your report. Please try again.',
				area,
				description
			});
		}
		return { ok: true };
	}
};
