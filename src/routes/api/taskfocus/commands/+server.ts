/**
 * TaskFocus device command channel (#021): the phone enqueues start/stop, the
 * desktop pulls the oldest first and acks by DELETE (idempotent).
 */
import {
	issueFocusCommandEndpoint,
	listFocusCommandsEndpoint
} from '$lib/domains/tasks/index.server';

export const GET = listFocusCommandsEndpoint.handler;
export const POST = issueFocusCommandEndpoint.handler;
