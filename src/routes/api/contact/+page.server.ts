import { contactEndpoint } from '$lib/domains/marketing/index.server';

/** The module's one `/api` route, kept on this form-action path for installed callers. */
export const actions = { default: contactEndpoint.handler };
