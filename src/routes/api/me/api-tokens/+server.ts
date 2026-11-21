import { createApiTokenEndpoint, listApiTokensEndpoint } from '$lib/domains/identity/index.server';

/** GET /api/me/api-tokens — your tokens; the hash never leaves the server. */
export const GET = listApiTokensEndpoint.handler;

/** POST /api/me/api-tokens `{name}` — mints one; the plaintext is in this response only. */
export const POST = createApiTokenEndpoint.handler;
