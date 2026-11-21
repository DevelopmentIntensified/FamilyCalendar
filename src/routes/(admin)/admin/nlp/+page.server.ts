import {
	adminPhraseRegisterPageLoad,
	adminResolveUnmatchedPhraseAction
} from '$lib/screens/admin/index.server';

export const load = adminPhraseRegisterPageLoad;
export const actions = { resolve: adminResolveUnmatchedPhraseAction };
