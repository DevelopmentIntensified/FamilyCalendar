import { accountMeDeleteEndpoint, accountMeGetEndpoint } from '$lib/screens/account/index.server';

/** GET /api/me — the caller's own identity, for the phone and TaskFocus. */
export const GET = accountMeGetEndpoint.handler;

/** DELETE /api/me `{confirmation}` — deletes the caller's account after the typed id. */
export const DELETE = accountMeDeleteEndpoint.handler;
