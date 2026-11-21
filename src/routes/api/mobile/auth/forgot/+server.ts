import { mobileForgotEndpoint } from '$lib/domains/access/index.server';

/** POST /api/mobile/auth/forgot `{email}` — the web reset mail; `{sent:true}` always. */
export const POST = mobileForgotEndpoint.handler;
