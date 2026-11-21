import { adminCountsEndpoint } from '$lib/screens/admin/index.server';

/** GET /api/admin (#292 G19) — the admin nav's open counts (the (admin) layout's). */
export const GET = adminCountsEndpoint.handler;
