import { familyHubActions, familyHubPageLoad } from '$lib/screens/familyHub/index.server';

/**
 * `/family/[familyId]` — wiring only (rule R8). The load, its 404 parity and
 * the five member/settings actions live in `familyHub`.
 */
export const load = familyHubPageLoad;
export const actions = familyHubActions;
