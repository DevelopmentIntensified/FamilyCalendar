/** POST /api/families/{id}/members/child — create the child account (#292 G10e). */
import { addChildEndpoint } from '$lib/domains/family/index.server';

export const POST = addChildEndpoint.handler;
