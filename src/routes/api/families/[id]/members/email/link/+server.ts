/** POST /api/families/{id}/members/email/link — mint a shareable invite link (#292 G10e). */
import { mintInviteLinkEndpoint } from '$lib/domains/family/index.server';

export const POST = mintInviteLinkEndpoint.handler;
