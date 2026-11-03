import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import { zoneFromSettings, zonedNow } from '$lib/server/utils/userTimezone';
import { loadSponsoredEvents, toSponsoredDisplay } from '$lib/server/services/calendarData';

/**
 * GET /api/sponsored-events?month=YYYY-MM (#292 G6) — the month's ad rows
 * the /calendar loader shows, `[]` unless the user opted in to ads
 * (`showAdsAsEvents`). Omitted month = the current month in the user zone.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const userId = auth.user.id;
	const settings = await getUserSettings(userId);
	const zone = zoneFromSettings(settings) ?? 'UTC';
	const monthParam = url.searchParams.get('month');
	let month: number;
	let year: number;
	if (monthParam === null) {
		const now = zonedNow(zone);
		month = now.month;
		year = now.year;
	} else {
		const m = /^(\d{4})-(\d{2})$/.exec(monthParam);
		if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) {
			return json({ error: 'Invalid month' }, { status: 400 });
		}
		year = Number(m[1]);
		month = Number(m[2]);
	}
	const rows = await loadSponsoredEvents(userId, settings, month, year);
	return json({ events: toSponsoredDisplay(rows, zone).map((e) => ({ ...e, isAd: true })) });
};
