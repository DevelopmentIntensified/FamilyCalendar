/**
 * Ack one TaskFocus command after the desktop acted on it. Always 204: an
 * unknown, already-acked or foreign id answers the same as a live one.
 */
import { ackFocusCommandEndpoint } from '$lib/domains/tasks/index.server';

export const DELETE = ackFocusCommandEndpoint.handler;
