import { accountSectionEndpoint } from '$lib/screens/account/index.server';

/** `GET /account/section/[section]` — the lazy per-section page data (Q-077), outside `/api`. */
export const GET = accountSectionEndpoint.handler;
