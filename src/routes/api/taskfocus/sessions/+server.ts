/**
 * Phone focus sessions (#293, TaskFocus #124): GET is the desktop's pull
 * (`?unabsorbed=1` only), POST starts an open session or records a finished one.
 */
import {
	listFocusSessionsEndpoint,
	startFocusSessionEndpoint
} from '$lib/domains/tasks/index.server';

export const GET = listFocusSessionsEndpoint.handler;
export const POST = startFocusSessionEndpoint.handler;
