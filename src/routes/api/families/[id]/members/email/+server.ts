import type { RequestHandler } from './$types';
import { POST as sendInviteEmail } from '../../../../../(family)/family/[familyId]/members/add/email/+server';

/**
 * POST /api/families/{id}/members/email (#292 G10e) — the web's
 * `/family/{id}/members/add/email` handler itself (default deps), reachable
 * with a Bearer token. Same body, same responses.
 */
export const POST: RequestHandler = (event) =>
	// SAFETY: the handler reads request, locals and params.familyId only.
	sendInviteEmail({ ...event, params: { familyId: event.params.id } } as never);
