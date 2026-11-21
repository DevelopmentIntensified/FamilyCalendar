/**
 * admin http: `GET /api/admin` and the `(admin)` group layout's `load`.
 *
 * Both answer the same composition (`getAdminCounts`), so the nav badges and
 * the JSON cannot disagree. The legacy wire is kept exactly: `endpoint` auth
 * `admin` refuses without a session (`401 {"error":"Unauthorized"}`) and for a
 * signed-in non-admin (`403 {"error":"Forbidden"}`) before any count is read,
 * and a Bearer caller is checked here too — the hook's segment gate covers the
 * pages, not the API.
 *
 * The layout load reads `pageLoad` auth `admin`: no session → `302 /login`, a
 * signed-in non-admin → `302 /calendar`. The hook already redirects every
 * `/admin` path, so the non-admin branch is the legacy layout's unreachable
 * defence-in-depth branch (`src/routes/(admin)/+layout.server.ts:6-12`).
 *
 * Doc: ./README.md#public-interface
 */
import { endpoint, ok } from '$lib/kernel/http/endpoint.server';
import { pageLoad } from '$lib/kernel/http/pageHandlers.server';
import type { AdminCounts } from './admin.contract';
import { getAdminCounts } from './admin.service.server';

/** `GET /api/admin` — the admin nav's open counts (#292 G19), as the layout shows them. */
export const adminCountsEndpoint = endpoint({
	auth: 'admin',
	handle: async ({ ctx }) => ok(await getAdminCounts(ctx))
});

/** `load` for the `(admin)` group: the role check plus the badge counts. */
export const adminLayoutLoad = pageLoad({
	auth: 'admin',
	handle: ({ ctx }): Promise<AdminCounts> => getAdminCounts(ctx)
});
