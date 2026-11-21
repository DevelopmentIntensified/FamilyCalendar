/** POST /api/families/{id}/members/direct — add an existing account (#292 G10e). */
import { addDirectEndpoint } from '$lib/domains/family/index.server';

export const POST = addDirectEndpoint.handler;
