import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { removeMember, setMemberType, updateMemberRole } from '$lib/server/services/familyData';
import { readJsonObject } from '$lib/server/utils/jsonBody';

/**
 * PATCH /api/families/{id}/members/{userId} `{role?, memberType?}` (#292
 * G10b) — the page's updateRole / setMemberType, same checks and messages.
 * `role` is applied first; the first refusal stops the request.
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const body = await readJsonObject(request);
	if (!body.ok) return body.response;
	const { role, memberType } = body.value;
	if (role === undefined && memberType === undefined) {
		return json({ error: 'role or memberType is required' }, { status: 400 });
	}
	if (role !== undefined) {
		const r = await updateMemberRole(
			auth.user.id,
			params.id,
			params.userId,
			typeof role === 'string' ? role : ''
		);
		if (!r.ok) return json({ error: r.error }, { status: r.status });
	}
	if (memberType !== undefined) {
		const r = await setMemberType(
			auth.user.id,
			params.id,
			params.userId,
			typeof memberType === 'string' ? memberType : ''
		);
		if (!r.ok) return json({ error: r.error }, { status: r.status });
	}
	return json({ success: true });
};

/** DELETE /api/families/{id}/members/{userId} — the page's removeMember (admin+). */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const r = await removeMember(auth.user.id, params.id, params.userId);
	if (!r.ok) return json({ error: r.error }, { status: r.status });
	return json({ success: true });
};
