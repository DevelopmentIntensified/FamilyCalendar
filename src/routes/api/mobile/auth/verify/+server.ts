import { mobileVerifyEndpoint } from '$lib/domains/access/index.server';

/** POST /api/mobile/auth/verify — redeems a code into `{token,user}`, no cookie. */
export const POST = mobileVerifyEndpoint.handler;
