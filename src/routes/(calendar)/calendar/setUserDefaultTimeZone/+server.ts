import { updateUserSettings } from '$lib/server/db/actions/userSettings';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
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
