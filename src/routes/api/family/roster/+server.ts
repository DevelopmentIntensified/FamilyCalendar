import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import {
	getFamilyMemberRole,
	getFamilyRoster,
	getUserFamilyId
} from '$lib/server/db/actions/families';

/**
 * GET /api/family/roster?familyId= (#292 G4) — the roster the calendar
 * filters, attendee picker, @mentions and edit dialog read (the calendar
 * layout's `getFamilyRoster`). Default: your family. A family you are not
 * in is a 403 — its member list is never readable.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const userId = auth.user.id;
	const requested = url.searchParams.get('familyId');
	let familyId: string | null;
	if (requested) {
		const role = await getFamilyMemberRole(userId, requested);
		if (!role) return json({ error: 'Not a member of this family' }, { status: 403 });
		familyId = requested;
	} else {
		familyId = await getUserFamilyId(userId);
	}
	if (!familyId) return json({ familyId: null, members: [] });
	return json({ familyId, members: await getFamilyRoster(familyId) });
};
