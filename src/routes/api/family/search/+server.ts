import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchUsers, getUserFamilies } from '$lib/server/db/actions/families';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const query = url.searchParams.get('q') || '';
	const familyId = url.searchParams.get('familyId');

	if (!query || !familyId) {
		return json({ users: [] });
	}

	const userFamilies = await getUserFamilies(locals.user.id);
	if (!userFamilies || userFamilies.families?.id !== familyId) {
		return json({ error: 'You do not have permission to search in this family' }, { status: 403 });
	}

	const users = await searchUsers(query, familyId);
	return json({ users });
};