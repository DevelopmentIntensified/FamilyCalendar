import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestHandler } from './$types';
import { createBugReport, BUG_AREAS } from '$lib/server/db/actions/bugReports';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';

function isBugReportBody(value: unknown): value is {
	area: unknown;
	description: unknown;
	url: unknown;
} {
	return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
	return typeof value === 'string';
}

function isBugArea(area: string): area is (typeof BUG_AREAS)[number] {
	return BUG_AREAS.some((candidate) => candidate === area);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!rateLimit(clientKey(request, 'bug-report'), 5, 5 * 60 * 1000)) {
		return json({ error: 'Too many reports. Try again shortly.' }, { status: 429 });
	}

	const body: unknown = await request.json().catch(() => null);
	if (!isBugReportBody(body)) {
		return json(
			{
				error: `area (one of ${BUG_AREAS.join(', ')}) and description (<=5000 chars) are required`
			},
			{ status: 400 }
		);
	}
	const area = isString(body.area) ? body.area : '';
	const description = isString(body.description) ? body.description.trim() : '';
	const url = isString(body.url) ? body.url.trim() : '';

	if (!area || !isBugArea(area) || !description || description.length > 5000) {
		return json(
			{
				error: `area (one of ${BUG_AREAS.join(', ')}) and description (<=5000 chars) are required`
			},
			{ status: 400 }
		);
	}

	const row = await createBugReport({
		userId: locals.user.id,
		area,
		description,
		url
	});
	if (!row) {
		return apiError(
			new URL(request.url).pathname,
			500,
			'Could not save report. Please try again.',
			locals.user?.id ?? null
		);
	}
	return json({ success: true, id: row.id });
};
