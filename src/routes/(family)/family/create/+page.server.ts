import { familyCreateAction, familyCreatePageLoad } from '$lib/domains/family/index.server';

export const load = familyCreatePageLoad;
export const actions = { default: familyCreateAction };
