/** POST /api/family/invite — mint a code; GET — preview one; DELETE — revoke one. */
import {
	mintInviteEndpoint,
	previewInviteEndpoint,
	revokeInviteEndpoint
} from '$lib/domains/family/index.server';

export const POST = mintInviteEndpoint.handler;
export const GET = previewInviteEndpoint.handler;
export const DELETE = revokeInviteEndpoint.handler;
