import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { listCalendarsForUser } from '$lib/server/services/calendarData';

/**
 * GET /api/calendars (#292 G2) — the calendars the viewer sees, named and
 * coloured as the /calendar loader shows them (calendar chips, filters,
 * the event form's picker). Personal first.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const userId = auth.user.id;
	const [settings, familyId] = await Promise.all([
		getUserSettings(userId),
		getUserFamilyId(userId).catch(() => null)
	]);
	return json({ calendars: await listCalendarsForUser(userId, settings, familyId) });
};
