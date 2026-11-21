/** POST /api/families/{id}/members/email — email a single-use invite (#292 G10e). */
import { sendInviteEmailEndpoint } from '$lib/domains/family/index.server';

export const POST = sendInviteEmailEndpoint.handler;
