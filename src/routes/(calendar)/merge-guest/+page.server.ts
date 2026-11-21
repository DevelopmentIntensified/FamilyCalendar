import {
	mergeGuestAction,
	mergeGuestPage,
	mergeGuestSkipAction
} from '$lib/domains/access/index.server';

/** /merge-guest — signed in, not a guest, with a stash worth offering. */
export const load = mergeGuestPage;

/** `?/merge` keeps the guest's Events and Tasks; `?/skip` forgets the stash. */
export const actions = { merge: mergeGuestAction, skip: mergeGuestSkipAction };
