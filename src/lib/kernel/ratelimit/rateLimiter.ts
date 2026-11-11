/**
 * Rate limiter port + in-memory sliding-window adapter (same algorithm as the
 * legacy `rateLimit()`), driven by an injected clock so tests can move time.
 *
 * Production wiring (src/lib/app/appCtx.server.ts) keeps using the legacy
 * module-level buckets until every limiter caller is ported, because web and
 * mobile sign-in deliberately SHARE buckets (issue 288). Switch the app to
 * `createMemoryRateLimiter(systemClock)` in the same commit that deletes the
 * last legacy `rateLimit(` call.
 *
 * Doc: src/lib/kernel/README.md#rate-limits
 */
import type { Clock } from '../time/clock';

export type RateLimiter = {
	/** True when one more hit fits under `limit` within the last `windowMs`; records the hit. */
	allow(key: string, limit: number, windowMs: number): boolean;
};

export type MemoryRateLimiter = RateLimiter & {
	/** Forget every bucket (tests). */
	reset(): void;
};

export function createMemoryRateLimiter(clock: Clock): MemoryRateLimiter {
	const buckets = new Map<string, number[]>();
	return {
		allow(key, limit, windowMs) {
			const now = clock.now().getTime();
			const hits = (buckets.get(key) ?? []).filter((at) => now - at < windowMs);
			if (hits.length >= limit) {
				buckets.set(key, hits);
				return false;
			}
			hits.push(now);
			buckets.set(key, hits);
			return true;
		},
		reset() {
			buckets.clear();
		}
	};
}

/**
 * Per-client bucket key: `${scope}:${ip}`. Prefers `x-real-ip`, else the first
 * hop of `x-forwarded-for` (Vercel sets both), else 'local'. Same keys as the
 * legacy `clientKey`, so ported endpoints share buckets with unported ones.
 */
export function clientKeyOf(request: Request, scope: string): string {
	const forwarded = request.headers.get('x-forwarded-for');
	const real = request.headers.get('x-real-ip');
	const ip = (real ?? forwarded?.split(',')[0] ?? 'local').trim() || 'local';
	return `${scope}:${ip}`;
}
