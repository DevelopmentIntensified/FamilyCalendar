import { resetPasswordAction } from '$lib/domains/access/index.server';

/** POST /forgot-password/reset `{token,password}` — single use; signs out every session and token. */
export const POST = resetPasswordAction.handler;
