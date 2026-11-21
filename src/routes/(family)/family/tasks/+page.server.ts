import { familyBoardPageLoad } from '$lib/screens/familyHub/index.server';

/**
 * `/family/tasks` — wiring only (rule R8). The family choice (named, else the
 * oldest), the completed window and the `/family` redirect live in `familyHub`.
 */
export const load = familyBoardPageLoad;
