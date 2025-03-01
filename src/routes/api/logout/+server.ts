import { lucia } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	const session = locals.session;
	if (!session) {
		return redirect(302, '/');
	}
	await lucia.invalidateSession(session.id);
	locals.session = null;
	locals.user = null;
	return redirect(302, '/');
};
