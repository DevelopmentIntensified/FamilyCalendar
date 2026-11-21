import {
	inviteEmailAcceptAction,
	inviteEmailPageLoad
} from '$lib/domains/access/index.server';

export const load = inviteEmailPageLoad;
export const actions = { default: inviteEmailAcceptAction };
