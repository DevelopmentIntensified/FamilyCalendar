import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import {
	addGroceryItem,
	getOpenGroceries,
	suggestGroceryStore,
	type GroceryScope
} from '$lib/server/db/actions/groceries';
import { parseGroceryQuickAdd } from '$lib/data/groceries';

function isString(v: unknown): v is string {
	return typeof v === 'string';
}

async function resolveScope(userId: string, raw: string | null): Promise<GroceryScope | null> {
	if (raw === 'mine') return { userId, familyId: null };
	if (raw === 'family') {
		const familyId = await getUserFamilyId(userId);
		return familyId ? { userId, familyId } : null;
	}
	return null;
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	const scope = await resolveScope(auth.user.id, url.searchParams.get('scope'));
	if (!scope) return json({ error: 'scope must be mine or family' }, { status: 400 });

	try {
		const name = url.searchParams.get('name');
		if (url.searchParams.get('suggest') && isString(name)) {
			return json({ store: await suggestGroceryStore(scope, name) });
		}
		return json({ items: await getOpenGroceries(scope) });
	} catch (error) {
		console.error('Failed to fetch groceries:', error);
		return apiError(url.pathname, 500, 'Failed to fetch groceries', auth.user.id);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	let body: { scope?: unknown; input?: unknown; stores?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const scope = await resolveScope(auth.user.id, isString(body.scope) ? body.scope : null);
	if (!scope) return json({ error: 'scope must be mine or family' }, { status: 400 });

	const parsed = parseGroceryQuickAdd(isString(body.input) ? body.input : '');
	if (!parsed.name) return json({ error: 'Name is required' }, { status: 400 });
	const stores = Array.isArray(body.stores) ? body.stores.filter(isString) : undefined;

	try {
		const item = await addGroceryItem({
			scope,
			name: parsed.name,
			quantity: parsed.quantity,
			stores
		});
		return json({ item }, { status: 201 });
	} catch (error) {
		console.error('Failed to add grocery:', error);
		return apiError('/api/groceries', 500, 'Failed to add item', auth.user.id);
	}
};
