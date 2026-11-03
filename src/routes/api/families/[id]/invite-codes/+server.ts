import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { loadInvitations } from '$lib/server/services/familyData';

/**
 * GET /api/families/{id}/invite-codes (#292 G10c) — the invitations page's
 * codes for ONE family (loadInvitations). Codes are listed to a
 * creator/admin only; a member gets `canManageInvites:false, codes:[]`.
 * Not a member → 404 (the page's fallback to another family never applies).
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const page = await loadInvitations(auth.user.id, params.id);
	if (page.family?.id !== params.id) {
		return json({ error: 'Family not found' }, { status: 404 });
	}
	return json({
		canManageInvites: page.canManageInvites,
		codes: page.invitations.map((c) => ({
			code: c.code,
			useCount: c.useCount ?? 0,
			maxUses: c.maxUses,
			expiresAt: c.expiresAt,
			// No createdAt: invite codes carry no creation timestamp column.
			createdBy: c.createdBy ?? null
		}))
	});
};
