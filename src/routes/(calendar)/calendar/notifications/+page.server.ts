import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getNotifications, getUnreadCount } from '$lib/server/db/actions/notifications';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const [notifications, unreadCount] = await Promise.all([
		getNotifications(event.locals.user.id, 50),
		getUnreadCount(event.locals.user.id)
	]);
	return { notifications, unreadCount };
};