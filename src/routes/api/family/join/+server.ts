/** POST /api/family/join — accept an invite code in one locked transaction. */
import { joinFamilyEndpoint } from '$lib/domains/family/index.server';

export const POST = joinFamilyEndpoint.handler;
