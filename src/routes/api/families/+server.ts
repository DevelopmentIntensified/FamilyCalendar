/**
 * GET /api/families — the `/family` list (#292 G10a); POST /api/families —
 * create one family (#292 G10d). Both live in family's http handlers.
 */
import {
	createFamilyEndpoint,
	listFamiliesEndpoint
} from '$lib/domains/family/index.server';

export const GET = listFamiliesEndpoint.handler;
export const POST = createFamilyEndpoint.handler;
