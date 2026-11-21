/** GET /api/family/roster — the roster the calendar filters and pickers read. */
import { rosterEndpoint } from '$lib/domains/family/index.server';

export const GET = rosterEndpoint.handler;
