import { claimVerifyAction, claimVerifyPage } from '$lib/domains/access/index.server';

/** GET /claim/verify/[token] — the confirm page; never consumes the token (issue 163). */
export const GET = claimVerifyPage.handler;

/** POST /claim/verify/[token] — consumes it once; a Claim Conflict merges and signs into the target. */
export const POST = claimVerifyAction.handler;
