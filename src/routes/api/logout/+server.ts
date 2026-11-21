import { logoutEndpoint } from '$lib/domains/access/index.server';

/** POST /api/logout — 302 `/` whether or not a session existed (Q-105: no Set-Cookie). */
export const POST = logoutEndpoint.handler;
