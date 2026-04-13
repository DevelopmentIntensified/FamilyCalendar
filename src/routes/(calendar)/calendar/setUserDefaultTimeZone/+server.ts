import { updateUserSettings } from '$lib/server/db/actions/userSettings';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const data = await event.request.json();
	const timeZone = data.timeZone;
	await updateUserSettings(event.locals.user.id, {
		timeZone
	});
	return new Response(null, {
		status: 200,
		headers: {}
	});
};
