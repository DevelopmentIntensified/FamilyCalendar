import { logoutEndpoint } from '$lib/domains/access/index.server';

/** POST /api/logout — 302 `/` whether or not a session existed, clearing the cookie (Q-105). */
export const POST = logoutEndpoint.handler;
