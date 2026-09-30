import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchUsers, getFamilyMemberRole } from '$lib/server/db/actions/families';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const query = url.searchParams.get('q') || '';
	const familyId = url.searchParams.get('familyId');

	if (!query || !familyId) {
		return json({ users: [] });
	}

	// A membership check for THIS family — not "the user's one family". Any
	// member may search the directory; non-members may not (issue 098).
	const role = await getFamilyMemberRole(locals.user.id, familyId);
	if (!role) {
		return json({ error: 'You do not have permission to search in this family' }, { status: 403 });
	}

	const users = await searchUsers(query, familyId);
	return json({ users });
};
