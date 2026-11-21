/** GET /api/location-search?q= — place suggestions for the event form. */
import { searchLocationsEndpoint } from '$lib/domains/calendar/index.server';

export const GET = searchLocationsEndpoint.handler;
