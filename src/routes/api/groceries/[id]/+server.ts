import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import {
	checkGroceryItem,
	deleteGroceryItem,
	moveGroceryItem,
	setGroceryStores,
	uncheckGroceryItem,
	type GroceryScope
} from '$lib/server/db/actions/groceries';

function isString(v: unknown): v is string {
	return typeof v === 'string';
}

async function resolveScope(userId: string, raw: unknown): Promise<GroceryScope | null> {
	if (raw === 'mine') return { userId, familyId: null };
	if (raw === 'family') {
		const familyId = await getUserFamilyId(userId);
		return familyId ? { userId, familyId } : null;
	}
	return null;
}

export const PATCH: RequestHandler = async ({ request, locals, url }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	const id = url.pathname.split('/').pop();
	if (!id) return json({ error: 'Item ID required' }, { status: 400 });

	let body: { scope?: unknown; op?: unknown; stores?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const scope = await resolveScope(auth.user.id, body.scope);
	if (!scope) return json({ error: 'scope must be mine or family' }, { status: 400 });

	try {
		let ok = false;
		if (body.op === 'check') ok = await checkGroceryItem(scope, id);
		else if (body.op === 'uncheck') ok = await uncheckGroceryItem(scope, id);
		else if (body.op === 'stores' && Array.isArray(body.stores)) {
			ok = await setGroceryStores(
				scope,
				id,
				body.stores.filter(isString)
			);
		} else if (body.op === 'move' && (body.target === 'mine' || body.target === 'family')) {
			const target = await resolveScope(auth.user.id, body.target);
			if (!target) return json({ error: 'No family to move to' }, { status: 400 });
			ok = await moveGroceryItem(scope, id, target);
		} else {
			return json({ error: 'op must be check, uncheck, stores, or move' }, { status: 400 });
		}
		if (!ok) return json({ error: 'Item not found' }, { status: 404 });
		return json({ ok: true });
	} catch (error) {
		console.error('Failed to update grocery:', error);
		return apiError(url.pathname, 500, 'Failed to update item', auth.user.id);
	}
};

export const DELETE: RequestHandler = async ({ locals, url }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	const id = url.pathname.split('/').pop();
	if (!id) return json({ error: 'Item ID required' }, { status: 400 });

	const scope = await resolveScope(auth.user.id, url.searchParams.get('scope'));
	if (!scope) return json({ error: 'scope must be mine or family' }, { status: 400 });

	try {
		const ok = await deleteGroceryItem(scope, id);
		if (!ok) return json({ error: 'Item not found' }, { status: 404 });
		return json({ ok: true });
	} catch (error) {
		console.error('Failed to delete grocery:', error);
		return apiError(url.pathname, 500, 'Failed to delete item', auth.user.id);
	}
};
