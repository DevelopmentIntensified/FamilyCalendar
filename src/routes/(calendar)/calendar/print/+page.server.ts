import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadPrintMonth } from '$lib/server/services/printData';

// The loader body is shared with GET /api/print (#292 G18).
export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	return await loadPrintMonth(
		event.locals.user.id,
		event.url.searchParams.get('year'),
		event.url.searchParams.get('month')
	);
};
