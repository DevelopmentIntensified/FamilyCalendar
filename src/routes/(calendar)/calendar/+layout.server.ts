import { shellCalendarGroupLoad } from '$lib/screens/shell/index.server';

// The calendar group's shared scope (#041): identity's settings, family's id
// and the roster once per group entry, plus the Anonymous Account countdown.
// No `pathname`: reading `url` in the legacy load made it re-run on every
// in-group navigation for three queries a time.
export const load = shellCalendarGroupLoad;
