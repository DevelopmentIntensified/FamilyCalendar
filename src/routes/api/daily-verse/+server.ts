import { json } from '@sveltejs/kit';
import { DateTime } from 'luxon';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { loadDailyVerse } from '$lib/server/services/calendarData';

/**
 * GET /api/daily-verse?date=YYYY-MM-DD (#292 G7) — the Daily Verse the
 * calendar + dashboard show, or `null` when the user hid it (setting) or
 * the family switched the module off. Omitted date = today.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const date = url.searchParams.get('date');
	if (
		date !== null &&
		(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !DateTime.fromISO(date).isValid)
	) {
		return json({ error: 'Invalid date' }, { status: 400 });
	}
	const userId = auth.user.id;
	const [settings, familyId] = await Promise.all([
		getUserSettings(userId),
		getUserFamilyId(userId).catch(() => null)
	]);
	const { verse } = await loadDailyVerse(settings, familyId, date ?? undefined);
	return json({
		verse: verse
			? { reference: verse.reference, text: verse.text, attribution: verse.attribution }
			: null
	});
};
