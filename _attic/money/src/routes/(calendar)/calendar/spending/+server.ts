import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Parked 2026-09-08 (#036): /calendar/spending → /spending. Bookmarks +
// deployed links keep working; no in-app links point here.
export const GET: RequestHandler = () => {
	redirect(301, '/spending');
};
