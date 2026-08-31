import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { getMealsByDate, addMeal, deleteMeal, isMealKind, isMealDate } from '$lib/server/db/actions/meals';

// Family-scoped: the caller must belong to a family, and all reads/writes
// resolve familyId from their membership (never from the request body).

export const GET: RequestHandler = async ({ locals, url }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	const familyId = await getUserFamilyId(auth.user.id);
	if (!familyId) return json({ meals: [] });

	const date = url.searchParams.get('date') ?? '';
	if (!isMealDate(date)) {
		return json({ error: 'date is required as YYYY-MM-DD' }, { status: 400 });
	}

	try {
		const meals = await getMealsByDate(familyId, date);
		return json({ meals });
	} catch (error) {
		console.error('Failed to fetch meals:', error);
		return json({ error: 'Failed to fetch meals' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	const familyId = await getUserFamilyId(auth.user.id);
	if (!familyId) return json({ error: 'No family' }, { status: 403 });

	let body: { date?: unknown; kind?: unknown; label?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const date = typeof body.date === 'string' ? body.date : '';
	const kind = typeof body.kind === 'string' ? body.kind : '';
	const label = typeof body.label === 'string' ? body.label : '';

	if (!isMealDate(date)) {
		return json({ error: 'date is required as YYYY-MM-DD' }, { status: 400 });
	}
	if (!isMealKind(kind)) {
		return json({ error: 'kind must be breakfast, lunch, dinner, or snack' }, { status: 400 });
	}
	if (!label.trim()) {
		return json({ error: 'label is required' }, { status: 400 });
	}

	try {
		const created = await addMeal({ familyId, date, kind, label, createdBy: auth.user.id });
		return json({ success: true, meal: created }, { status: 201 });
	} catch (error) {
		console.error('Failed to create meal:', error);
		return json({ error: 'Failed to create meal' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	const familyId = await getUserFamilyId(auth.user.id);
	if (!familyId) return json({ error: 'No family' }, { status: 403 });

	let body: { id?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const id = typeof body.id === 'string' && body.id ? body.id : '';
	if (!id) return json({ error: 'id is required' }, { status: 400 });

	try {
		const removed = await deleteMeal(id, familyId);
		if (!removed) return json({ error: 'Meal not found' }, { status: 404 });
		return json({ success: true });
	} catch (error) {
		console.error('Failed to delete meal:', error);
		return json({ error: 'Failed to delete meal' }, { status: 500 });
	}
};