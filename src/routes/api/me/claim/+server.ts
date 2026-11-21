import { claimRequestBodyEndpoint } from '$lib/domains/access/index.server';

/** POST /api/me/claim `{email}` — a guest asks for the web claim link; `{sent:true}` either way. */
export const POST = claimRequestBodyEndpoint.handler;
