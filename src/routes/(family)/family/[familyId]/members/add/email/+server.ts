/** POST /family/{id}/members/add/email — the same handler as the `/api` door (#292 G10e). */
import { sendInviteEmailEndpoint } from '$lib/domains/family/index.server';

export const POST = sendInviteEmailEndpoint.handler;
