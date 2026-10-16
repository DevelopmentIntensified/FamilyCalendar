import type { RequestHandler } from './$types';
import { buildUserDataExport } from '$lib/server/db/actions/export';

/**
 * GET /api/account/export — GDPR data export (#189). Streams one JSON
 * document of the requester's own data as an attachment. Doorway only:
 * the row assembly and its scope decisions live in
 * `src/lib/server/db/actions/export.ts` (and its tests).
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const data = await buildUserDataExport(locals.user.id);
	const json = JSON.stringify(data, null, 2);
	// Single-document stream: chunk once, close immediately.
	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(json));
			controller.close();
		}
	});

	const date = new Date().toISOString().slice(0, 10);
	return new Response(body, {
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Content-Disposition': `attachment; filename="familyplanz-export-${date}.json"`
		}
	});
};
