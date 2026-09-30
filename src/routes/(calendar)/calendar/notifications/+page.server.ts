import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	getNotifications,
	getUnreadCount,
	NOTIFICATION_PAGE_SIZE
} from '$lib/server/db/actions/notifications';
import { toNotificationRow, unrecognisedTypes } from '$lib/utils/notificationTypes';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const [rows, unreadCount] = await Promise.all([
		getNotifications(event.locals.user.id, NOTIFICATION_PAGE_SIZE),
		getUnreadCount(event.locals.user.id)
	]);

	// The type guard lives here, at the boundary: `notifications.type` is free
	// text, so an unrecognised value is a live possibility, not a type error.
	const notifications = rows.map(toNotificationRow);
	const unknown = unrecognisedTypes(notifications);
	if (unknown.length) {
		console.warn(`[alerts] unrecognised notification type(s): ${unknown.join(', ')}`);
	}

	return { notifications, unreadCount };
};
