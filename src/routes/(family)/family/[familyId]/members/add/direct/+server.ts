/** POST /family/{id}/members/add/direct — the same handler as the `/api` door (#292 G10e). */
import { addDirectEndpoint } from '$lib/domains/family/index.server';

export const POST = addDirectEndpoint.handler;
