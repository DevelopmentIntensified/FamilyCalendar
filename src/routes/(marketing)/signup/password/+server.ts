import { signupPasswordAction } from '$lib/domains/access/index.server';

/** POST /signup/password — 201 pending + session cookie; a taken address gets the same shape. */
export const POST = signupPasswordAction.handler;
