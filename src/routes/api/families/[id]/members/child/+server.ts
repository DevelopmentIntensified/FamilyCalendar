import type { RequestHandler } from './$types';
import { POST as addChild } from '../../../../../(family)/family/[familyId]/members/add/child/+server';

/**
 * POST /api/families/{id}/members/child (#292 G10e) — the web's
 * `/family/{id}/members/add/child` handler itself, reachable with a Bearer
 * token. Same body, same responses.
 */
export const POST: RequestHandler = (event) =>
	// SAFETY: the handler reads request, locals and params.familyId only.
	addChild({ ...event, params: { familyId: event.params.id } } as never);
