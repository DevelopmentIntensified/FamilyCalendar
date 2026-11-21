/**
 * One phone focus session (#293): PATCH stops it (`{endedAt}`, a retry
 * overwrites), DELETE discards an unabsorbed one. Another user's id is 404.
 */
import {
	discardFocusSessionEndpoint,
	endFocusSessionEndpoint
} from '$lib/domains/tasks/index.server';

export const PATCH = endFocusSessionEndpoint.handler;
export const DELETE = discardFocusSessionEndpoint.handler;
