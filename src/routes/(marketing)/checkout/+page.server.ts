import { checkoutPageLoad, checkoutPurchaseAction } from '$lib/domains/marketing/index.server';

/** Signed-in only, with the legacy `?redirect=/checkout`; the quote is billing's. */
export const load = checkoutPageLoad;

/** The stub purchase: the legacy refusals, and no provider call to make. */
export const actions = { purchase: checkoutPurchaseAction };
