import type { RequestHandler } from './$types';
import { POST as mintEmailLink } from '../../../../../../(family)/family/[familyId]/members/add/email/link/+server';

/**
 * POST /api/families/{id}/members/email/link (#292 G10e) — the web's
 * `/family/{id}/members/add/email/link` handler itself (default deps),
 * reachable with a Bearer token. Same body, same responses.
 */
export const POST: RequestHandler = (event) =>
	// SAFETY: the handler reads request, locals and params.familyId only.
	mintEmailLink({ ...event, params: { familyId: event.params.id } } as never);
