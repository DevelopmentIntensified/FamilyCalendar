import { DateTime } from 'luxon';
import { getUserSettings } from '$lib/server/db/actions/userSettings';

/**
 * The user's stored IANA timezone, validated. Undefined falls back to
 * server-local — only acceptable as a transitional default.
 */
export async function getUserZone(userId: string): Promise<string | undefined> {
	const settings = await getUserSettings(userId);
	const tz = settings?.timeZone;
	if (!tz || !DateTime.local().setZone(tz).isValid) return undefined;
	return tz;
}

/** Current time in the user's zone (server-local when no zone given). */
export function zonedNow(tz?: string | null): DateTime {
	return tz ? DateTime.now().setZone(tz) : DateTime.now();
}
