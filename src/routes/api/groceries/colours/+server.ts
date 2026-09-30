import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { getStoreColours, setStoreColour } from '$lib/server/db/actions/groceries';
import { STORE_COLOURS } from '$lib/data/groceries';

function isString(v: unknown): v is string {
	return typeof v === 'string';
}

/**
 * Store colours (096). Not under /api/groceries/[id]: a colour belongs to a
 * STORE, and a store is free text on an item rather than a row of its own, so
 * there is no id to hang it on. `scope` here is the colour's own scope —
 * 'family' writes the shared row, anything else writes the viewer's override,
 * which wins on read.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	try {
		const familyId = await getUserFamilyId(auth.user.id);
		const colours = await getStoreColours({ userId: auth.user.id, familyId });
		return json({ colours, palette: STORE_COLOURS.map((c) => ({ key: c.key, label: c.label })) });
	} catch (error) {
		console.error('Failed to fetch store colours:', error);
		return apiError('/api/groceries/colours', 500, 'Failed to fetch store colours', auth.user.id);
	}
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	let body: { store?: unknown; color?: unknown; scope?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	if (!isString(body.store) || !isString(body.color)) {
		return json({ error: 'store and color are required' }, { status: 400 });
	}
	const target = body.scope === 'family' ? 'family' : 'personal';
	const familyId = target === 'family' ? await getUserFamilyId(auth.user.id) : null;
	if (target === 'family' && !familyId) {
		return json({ error: 'No family to set a family colour on' }, { status: 400 });
	}

	try {
		const ok = await setStoreColour(
			{ userId: auth.user.id, familyId },
			{ scope: target, store: body.store, color: body.color }
		);
		if (!ok) return json({ error: 'That store or colour cannot take a colour' }, { status: 400 });
		return json({ ok: true });
	} catch (error) {
		console.error('Failed to set store colour:', error);
		return apiError('/api/groceries/colours', 500, 'Failed to set the colour', auth.user.id);
	}
};
