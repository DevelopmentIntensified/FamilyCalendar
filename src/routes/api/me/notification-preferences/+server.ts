import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { NOTIFICATION_PREFERENCES } from '$lib/components/account/accountNotifications';
import { loadNotificationPreferences } from '$lib/server/services/accountData';

/**
 * GET /api/me/notification-preferences (#292 G14) — the four switches as the
 * account page shows them (defaults when never touched; this read writes
 * nothing), plus their labels.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	return json({
		preferences: await loadNotificationPreferences(auth.user.id),
		options: NOTIFICATION_PREFERENCES.map(({ id, label, hint, default: d }) => ({
			id,
			label,
			hint,
			default: d
		}))
	});
};
