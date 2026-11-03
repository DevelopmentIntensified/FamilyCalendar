import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { getFamily } from '$lib/server/db/actions/families';
import { loadFamilyDetail, updateFamilyDetails } from '$lib/server/services/familyData';
import { readJsonObject } from '$lib/server/utils/jsonBody';

/**
 * GET /api/families/{id} (#292 G10b) — the family detail page's data
 * (loadFamilyDetail). Not a member, or no such family → 404 (the page's
 * one answer for both, so ids cannot be probed).
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const detail = await loadFamilyDetail(auth.user.id, params.id);
	if (!detail) return json({ error: 'Family not found' }, { status: 404 });
	return json(detail);
};

/** PATCH /api/families/{id} `{name?, color?}` — admin+ (the page's updateFamily). */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const body = await readJsonObject(request);
	if (!body.ok) return body.response;
	const { name, color } = body.value;
	if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
		return json({ error: 'Invalid name' }, { status: 400 });
	}
	if (color !== undefined && (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color))) {
		return json({ error: 'Invalid color' }, { status: 400 });
	}
	const result = await updateFamilyDetails(
		auth.user.id,
		params.id,
		typeof name === 'string' ? name.trim() : '',
		typeof color === 'string' ? color : ''
	);
	if (!result.ok) return json({ error: result.error }, { status: result.status });
	return json({ success: true, family: (await getFamily(params.id)) ?? null });
};
