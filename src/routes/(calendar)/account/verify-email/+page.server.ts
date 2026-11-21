import { verifyEmailAction, verifyEmailPage } from '$lib/domains/access/index.server';

/** /account/verify-email — signed in; the page reads `?token` client-side. */
export const load = verifyEmailPage;

/** `?/verify` — the token or code path, identity-bound and single use. */
export const actions = { verify: verifyEmailAction };
