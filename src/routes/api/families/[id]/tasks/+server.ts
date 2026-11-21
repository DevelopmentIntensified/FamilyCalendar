import { familyBoardEndpoint } from '$lib/screens/familyHub/index.server';

/**
 * GET /api/families/{id}/tasks (#292 G11) — the /family/tasks board for ONE
 * family. Wiring only: the composition, the 401 and the 404 live in
 * `familyHub` (rule R8).
 */
export const GET = familyBoardEndpoint.handler;
