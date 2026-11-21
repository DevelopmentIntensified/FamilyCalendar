import { legacyFamilyBoardPathLoad } from '$lib/screens/familyHub/index.server';

/**
 * `/family/[familyId]/tasks` — the deleted per-family board's redirect only
 * (issue 124): `302 /login` signed out, `308 /family/tasks` signed in. Wiring
 * only (rule R8).
 */
export const load = legacyFamilyBoardPathLoad;
