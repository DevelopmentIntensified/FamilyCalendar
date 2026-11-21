import {
	listAlertsEndpoint,
	markAlertsEndpoint
} from '$lib/domains/alerts/index.server';

export const GET = listAlertsEndpoint.handler;
export const POST = markAlertsEndpoint.handler;
