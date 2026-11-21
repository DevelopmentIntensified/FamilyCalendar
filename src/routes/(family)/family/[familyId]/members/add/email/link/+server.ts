/** POST /family/{id}/members/add/email/link — the same handler as the `/api` door (#292 G10e). */
import { mintInviteLinkEndpoint } from '$lib/domains/family/index.server';

export const POST = mintInviteLinkEndpoint.handler;
