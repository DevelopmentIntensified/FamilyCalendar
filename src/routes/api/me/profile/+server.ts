import { updateProfileEndpoint } from '$lib/domains/identity/index.server';

/** PATCH /api/me/profile `{firstName,lastName}` — the account page's updateProfile. */
export const PATCH = updateProfileEndpoint.handler;
