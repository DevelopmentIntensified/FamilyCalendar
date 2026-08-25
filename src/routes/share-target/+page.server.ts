import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const title = url.searchParams.get('title') ?? '';
	const text = url.searchParams.get('text') ?? '';
	const link = url.searchParams.get('url') ?? '';

	const combined = [text || title, link].filter(Boolean).join(' ');

	return redirect(302, `/calendar?quickadd=${encodeURIComponent(combined)}`);
};
