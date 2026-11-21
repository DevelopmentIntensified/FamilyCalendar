/**
 * tasks archive http: `GET /api/archive` and the `/calendar/archive` page
 * load — the same composition, so the page and the phone cannot read two
 * different archives (#292 G16).
 *
 * The wire is the legacy one byte for byte: `{events, archiveAllowed, reason?,
 * planName, familyCount, retentionDays, archivedRetentionDays}`, signed-in
 * only, `401 {"error":"Unauthorized"}` otherwise, and no rate limit (the route
 * has never had one).
 *
 * Doc: ./README.md#public-interface
 */
import { endpoint, ok } from '$lib/kernel/http/endpoint.server';
import { pageLoad } from '$lib/kernel/http/pageHandlers.server';
import { getArchivePage } from './tasks.archive.service.server';

/** `GET /api/archive`: the page's data verbatim. */
export const archiveEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor }) => ok(await getArchivePage(ctx, actor))
});

/** `GET /calendar/archive`'s load. */
export const archivePageLoad = pageLoad({
	auth: 'user',
	handle: async ({ ctx, actor }) => await getArchivePage(ctx, actor)
});
