/** POST /family/{id}/members/add/child — the same handler as the `/api` door (#292 G10e). */
import { addChildEndpoint } from '$lib/domains/family/index.server';

export const POST = addChildEndpoint.handler;
