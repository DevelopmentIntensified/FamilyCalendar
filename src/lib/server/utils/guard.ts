/**
 * Tolerant section loading: a failing model degrades to its fallback (plus a
 * warning label) instead of 500ing the whole page. Pages compose sections
 * with this and surface `loadWarnings` as an inline banner.
 */

export type Guarded<T> = { data: T; error: string | null };

export async function guard<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<Guarded<T>> {
	try {
		return { data: await fn(), error: null };
	} catch (error) {
		console.error(`[load] section "${label}" failed, serving fallback:`, error);
		return { data: fallback, error: label };
	}
}
