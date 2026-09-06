import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getNotifications,
	getUnreadCount,
	markNotificationRead,
	markAllNotificationsRead
} from '$lib/server/db/actions/notifications';
import { requireUserJson } from '$lib/server/utils/requireUser';

export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	const [notifications, unreadCount] = await Promise.all([
		getNotifications(auth.user.id, 20),
		getUnreadCount(auth.user.id)
	]);

	return json({ notifications, unreadCount });
};

function isNotificationBody(value: unknown): value is { all?: unknown; id?: unknown } {
	return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	const body: unknown = await request.json().catch(() => null);
	if (!isNotificationBody(body)) {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	if (body.all === true) {
		await markAllNotificationsRead(auth.user.id);
		return json({ success: true });
	}

	if (!isNonEmptyString(body.id)) {
		return json({ error: 'Notification id is required' }, { status: 400 });
	}

	await markNotificationRead(auth.user.id, body.id);
	return json({ success: true });
};
