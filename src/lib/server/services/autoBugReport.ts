import type { NewBugReport, BugArea } from '$lib/server/db/actions/bugReports';

/**
 * Auto-filing for truly-unexpected failures (SvelteKit handleError). Skips
 * 404s and empty messages; everything else becomes a bug report so a 500
 * never vanishes silently. Never throws — filing must not break the error
 * response itself.
 */

const THROTTLE_MS = 10 * 60 * 1000;
const lastFiledByKey = new Map<string, number>();

export function buildAutoBugReport(input: {
	status: number;
	message: string;
	path: string;
	userId: string | null;
}): NewBugReport | null {
	if (input.status === 404) return null;
	const message = input.message.trim();
	if (!message) return null;
	const description = `[auto-filed ${input.status}] ${message}`.slice(0, 5000);
	return {
		userId: input.userId,
		area: areaForPath(input.path),
		description,
		url: input.path.slice(0, 2000) || null
	};
}

function areaForPath(path: string): BugArea {
	if (path.includes('/dashboard')) return 'dashboard';
	if (path.includes('/calendar') || path.startsWith('/api/events')) return 'calendar';
	if (path.includes('/tasks') || path.startsWith('/api/tasks')) return 'tasks';
	if (path.includes('/account') || path.includes('/claim') || path.includes('/login')) return 'account';
	return 'other';
}

/** Best-effort flood control: one filing per failure key per throttle window. */
export function shouldFileAutoReport(key: string, now = Date.now()): boolean {
	const last = lastFiledByKey.get(key);
	if (last !== undefined && now - last < THROTTLE_MS) return false;
	lastFiledByKey.set(key, now);
	return true;
}

/** Test-only seam for the in-memory throttle. */
export function __resetAutoReportThrottle(): void {
	lastFiledByKey.clear();
}
