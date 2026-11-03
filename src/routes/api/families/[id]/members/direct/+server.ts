import type { RequestHandler } from './$types';
import { POST as addDirect } from '../../../../../(family)/family/[familyId]/members/add/direct/+server';

/**
 * POST /api/families/{id}/members/direct (#292 G10e) — the web's
 * `/family/{id}/members/add/direct` handler itself, reachable with a Bearer
 * token (the hook authenticates Bearer on /api only). Same body, same
 * responses; only the path param is renamed.
 */
export const POST: RequestHandler = (event) =>
	// SAFETY: the handler reads request, locals and params.familyId only.
	addDirect({ ...event, params: { familyId: event.params.id } } as never);
