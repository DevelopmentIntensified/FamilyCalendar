import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { acceptInvite } from '$lib/server/db/actions/families';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const { code } = body;

	if (!code) {
		return json({ error: 'Invite code is required' }, { status: 400 });
	}

	try {
		const success = await acceptInvite(locals.user.id, code);

		if (!success) {
			return json({ error: 'Invalid, expired, or already used invite code' }, { status: 400 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('Error accepting invite:', error);
		return json({ error: 'Failed to accept invite' }, { status: 500 });
	}
};
