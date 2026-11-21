import { claimPage, claimRequestAction } from '$lib/domains/access/index.server';

/** /claim — signed in and still an Anonymous Account (registered users go to the calendar). */
export const load = claimPage;

/** `?/request` — the claim link request, shared with POST /api/me/claim. */
export const actions = { request: claimRequestAction };
