import { shellRootLoad } from '$lib/screens/shell/index.server';

// The chrome's data (a whitelisted session summary + the server year) and the
// ONE app-chrome guard: a guest on /calendar/** or /family/** is a 302 /login.
// No query and no `url` read, so it never re-runs on navigation.
export const load = shellRootLoad;
