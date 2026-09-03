import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestHandler } from './$types';
import { createBugReport, BUG_AREAS } from '$lib/server/db/actions/bugReports';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!rateLimit(clientKey(request, 'bug-report'), 5, 5 * 60 * 1000)) {
		return json({ error: 'Too many reports. Try again shortly.' }, { status: 429 });
	}

	const body = await request.json().catch(() => ({}) as Record<string, unknown>);
	const area = body.area as string;
	const description = typeof body.description === 'string' ? body.description.trim() : '';
	const url = typeof body.url === 'string' ? body.url.trim() : '';

	if (
		!area ||
		!(BUG_AREAS as readonly string[]).includes(area) ||
		!description ||
		description.length > 5000
	) {
		return json(
			{
				error: `area (one of ${BUG_AREAS.join(', ')}) and description (<=5000 chars) are required`
			},
			{ status: 400 }
		);
	}

	const row = await createBugReport({
		userId: locals.user.id,
		area: area as (typeof BUG_AREAS)[number],
		description,
		url
	});
	if (!row) {
		return apiError(new URL(request.url).pathname, 500, 'Could not save report. Please try again.', locals.user?.id ?? null);
	}
	return json({ success: true, id: row.id });
};
