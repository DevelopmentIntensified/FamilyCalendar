import {
	registerDeviceEndpoint,
	unregisterDeviceEndpoint
} from '$lib/domains/alerts/index.server';

export const POST = registerDeviceEndpoint.handler;
export const DELETE = unregisterDeviceEndpoint.handler;
