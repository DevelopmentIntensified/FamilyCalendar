import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { getFamily } from '$lib/server/db/actions/families';
import { createFamilyWithMembers, loadFamiliesOverview } from '$lib/server/services/familyData';
import { readJsonObject } from '$lib/server/utils/jsonBody';

/**
 * GET /api/families (#292 G10a) — the /family list: every family you are a
 * member of, the side-rail roster, live invite codes and plan usage
 * (loadFamiliesOverview).
 */
export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	return json(await loadFamiliesOverview(auth.user.id));
};

/**
 * POST /api/families `{name, color?, memberIds?}` (#292 G10d) — the
 * /family/create action (createFamilyWithMembers): plan gate, palette
 * check, verified-member picks, member limit, one transaction.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const body = await readJsonObject(request);
	if (!body.ok) return body.response;
	const { name, color, memberIds } = body.value;
	if (memberIds !== undefined && !Array.isArray(memberIds)) {
		return json({ error: 'memberIds must be an array' }, { status: 400 });
	}
	const result = await createFamilyWithMembers(auth.user.id, async () => ({
		name: typeof name === 'string' ? name : '',
		color: typeof color === 'string' ? color : '',
		memberIds: memberIds ?? []
	}));
	if (!result.ok) {
		return json(
			{ error: result.error, ...(result.upgradeRequired ? { upgradeRequired: true } : {}) },
			{ status: result.status }
		);
	}
	return json({ family: (await getFamily(result.familyId)) ?? { id: result.familyId } }, { status: 201 });
};
