import { getSettingsEndpoint, patchSettingsEndpoint } from '$lib/domains/identity/index.server';

/** GET /api/me/settings — the /account settings card's data. */
export const GET = getSettingsEndpoint.handler;

/** PATCH /api/me/settings — any subset of the calendar-settings fields. */
export const PATCH = patchSettingsEndpoint.handler;
