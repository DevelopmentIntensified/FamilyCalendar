/** GET /api/family/search — the invite flow's exact-match directory lookup. */
import { searchFamilyEndpoint } from '$lib/domains/family/index.server';

export const GET = searchFamilyEndpoint.handler;
