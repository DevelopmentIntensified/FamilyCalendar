import { accountCalendarSettingsRedirect } from '$lib/screens/account/index.server';

/** `/calendar/settings` — a 302 to the account page's Calendar section only. */
export const load = accountCalendarSettingsRedirect;
