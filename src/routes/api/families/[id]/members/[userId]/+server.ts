/**
 * PATCH /api/families/{id}/members/{userId} — role and/or Member Type;
 * DELETE — remove the member (admin+).
 */
import {
	changeMemberEndpoint,
	removeMemberEndpoint
} from '$lib/domains/family/index.server';

export const PATCH = changeMemberEndpoint.handler;
export const DELETE = removeMemberEndpoint.handler;
