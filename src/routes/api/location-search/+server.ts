import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';

interface NominatimResult {
	display_name: string;
	lat: string;
	lon: string;
}

export const GET: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!rateLimit(clientKey(request, 'location-search'), 60, 60_000)) {
		return json({ error: 'Too many searches. Try again shortly.' }, { status: 429 });
	}

	const q = (url.searchParams.get('q') ?? '').trim();
	if (q.length < 2 || q.length > 100) {
		return json({ error: 'q is required and must be 2-100 characters' }, { status: 400 });
	}

	try {
		const res = await fetch(
			`https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=5&q=${encodeURIComponent(q)}`,
			{
				headers: {
					'User-Agent': 'FamilyPlanz/1.0 (test@familyplanz.com)'
				},
				signal: AbortSignal.timeout(10_000)
			}
		);
		if (!res.ok) {
			return json({ results: [] });
		}
		const data = (await res.json()) as NominatimResult[];
		return json({
			results: data.map((r) => ({ label: r.display_name, lat: r.lat, lon: r.lon }))
		});
	} catch {
		return json({ results: [] });
	}
};
