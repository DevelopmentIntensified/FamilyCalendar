/**
 * GET /api/families/{id} — the family detail payload (#292 G10b); PATCH —
 * rename/recolour (admin+).
 */
import { getFamilyEndpoint, updateFamilyEndpoint } from '$lib/domains/family/index.server';

export const GET = getFamilyEndpoint.handler;
export const PATCH = updateFamilyEndpoint.handler;
