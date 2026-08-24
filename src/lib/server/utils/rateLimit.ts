// In-memory sliding-window rate limiter. State lives in module scope, so it is
// per-server-instance — fine for single-instance deploys; swap for Redis if
// the app is ever scaled horizontally.
const buckets = new Map<string, number[]>();

/** Returns true when the action is allowed under the limit within the window. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
	const now = Date.now();
	const timestamps = buckets.get(key) ?? [];
	while (timestamps.length > 0 && now - timestamps[0] >= windowMs) {
		timestamps.shift();
	}
	if (timestamps.length >= limit) {
		return false;
	}
	timestamps.push(now);
	buckets.set(key, timestamps);
	return true;
}

/** Stable per-client bucket key combining the caller IP with a scope label. */
export function clientKey(request: Request, scope: string): string {
	const ip = request?.headers?.get('x-forwarded-for') ?? 'local';
	return `${scope}:${ip}`;
}
