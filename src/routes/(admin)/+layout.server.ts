import { adminLayoutLoad } from '$lib/screens/admin/index.server';

// Role check (pageLoad auth admin: 302 /login, non-admin 302 /calendar) plus
// the badge counts, shared with GET /api/admin (#292 G19).
export const load = adminLayoutLoad;
