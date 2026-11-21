/**
 * GET /api/families/{id}/invite-codes — one family's codes (#292 G10c), hidden
 * from a plain member.
 */
import { listInviteCodesEndpoint } from '$lib/domains/family/index.server';

export const GET = listInviteCodesEndpoint.handler;
