import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { readJsonObject } from '$lib/server/utils/jsonBody';
import { isNotificationPreferenceId } from '$lib/components/account/accountNotifications';
import { saveNotificationPreference } from '$lib/server/services/accountData';

/**
 * PUT /api/me/notification-preferences/{id} `{value:boolean}` (#292 G14) —
 * one switch, one receipt (the account page's setNotificationPreference).
 */
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	// The path decides which row is written: no inventing a fifth switch.
	if (!isNotificationPreferenceId(params.id)) {
		return json({ error: 'Unknown notification preference' }, { status: 400 });
	}
	const body = await readJsonObject(request);
	if (!body.ok) return body.response;
	if (typeof body.value.value !== 'boolean') {
		return json({ error: 'Notification preference value is required' }, { status: 400 });
	}
	const r = await saveNotificationPreference(auth.user.id, params.id, body.value.value);
	if (!r.ok) return json({ error: r.message }, { status: r.status });
	return json({ success: true, message: r.message });
};
