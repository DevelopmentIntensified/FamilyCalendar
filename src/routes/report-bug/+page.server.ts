import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createBugReport, BUG_AREAS, type BugArea } from '$lib/server/db/actions/bugReports';
import { safeReportedPath } from '$lib/utils/reportBug';

/** True for submitted areas that name a real bug category. */
function isBugArea(v: string): v is BugArea {
	return BUG_AREAS.some((area) => area === v);
}

export const load: PageServerLoad = async ({ locals, url, request }) => {
	if (!locals.user) throw redirect(302, '/login');
	// Issue 257: the page the bug was on. Links pass `?from=`; otherwise the GET
	// referer (client nav sends the originating page). The POST referer is
	// always /report-bug, so the form carries this back as a hidden input.
	const from =
		safeReportedPath(url.searchParams.get('from'), url.origin) ||
		safeReportedPath(request.headers.get('referer'), url.origin);
	return { areas: [...BUG_AREAS], from };
};

export const actions: Actions = {
	submit: async ({ locals, request, url }) => {
		if (!locals.user)
			return fail(401, { error: 'Please log in to report a bug.', area: '', description: '' });

		const form = await request.formData();
		const area = String(form.get('area') ?? '');
		const description = String(form.get('description') ?? '').trim();
		const from =
			safeReportedPath(String(form.get('from') ?? ''), url.origin) ||
			safeReportedPath(request.headers.get('referer'), url.origin);

		if (!isBugArea(area)) {
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
			area,
			description,
			url: from || url.pathname
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
