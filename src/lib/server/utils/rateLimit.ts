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

/** Stable per-client bucket key combining the caller IP with a scope label.
 *
 * Vercel overwrites `x-forwarded-for` with the real client IP (no spoofing —
 * https://vercel.com/docs/headers/request-headers), but the value can still
 * be a multi-hop chain, so only the first hop is keyed. `x-real-ip` is
 * preferred when present (single IP by construction). Local dev has neither
 * and falls back to 'local'. */
export function clientKey(request: Request, scope: string): string {
	const fwd = request?.headers?.get('x-forwarded-for');
	const real = request?.headers?.get('x-real-ip');
	const ip = (real ?? fwd?.split(',')[0] ?? 'local').trim() || 'local';
	return `${scope}:${ip}`;
}

/** TEST-ONLY: empties the module-scope window store so route tests can claim
 * clean buckets per case (the map is in-process state shared across test
 * files otherwise).
 */
export function clearRateLimitState(): void {
	buckets.clear();
}
