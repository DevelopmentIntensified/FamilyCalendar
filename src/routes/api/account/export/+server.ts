import { accountExportEndpoint } from '$lib/screens/account/index.server';

/** GET /api/account/export — the requester's JSON document, as a dated attachment. */
export const GET = accountExportEndpoint.handler;
