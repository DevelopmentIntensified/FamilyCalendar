/** GET /api/family/member-search — the create page's picker type-ahead. */
import { memberSearchEndpoint } from '$lib/domains/family/index.server';

export const GET = memberSearchEndpoint.handler;
