import { changeEmailEndpoint } from '$lib/domains/access/index.server';

/** POST /api/me/email `{email}` — starts an email change; the code goes to the NEW address. */
export const POST = changeEmailEndpoint.handler;
