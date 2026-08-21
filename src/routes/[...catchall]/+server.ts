import type { RequestHandler } from './$types';

// Fallback for unmatched routes (bot probes like /xmlrpc.php, /.env, etc.).
// Returns a quiet 404 instead of throwing SvelteKitError into the logs.
const handler: RequestHandler = () => {
	return new Response(null, { status: 404 });
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
