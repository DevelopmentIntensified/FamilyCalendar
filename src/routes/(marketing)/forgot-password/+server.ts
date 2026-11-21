import { forgotPasswordAction } from '$lib/domains/access/index.server';

/** POST /forgot-password `{email}` — `{success:true}` for known and unknown addresses (#245). */
export const POST = forgotPasswordAction.handler;
