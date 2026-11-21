/**
 * Desktop ack after its focusMinutes PUT succeeded (#293). Idempotent; an open
 * session cannot be absorbed (409), an unknown one is 404.
 */
import { absorbFocusSessionEndpoint } from '$lib/domains/tasks/index.server';

export const POST = absorbFocusSessionEndpoint.handler;
