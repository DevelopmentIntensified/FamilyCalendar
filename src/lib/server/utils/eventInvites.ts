import { getUserFamilyId, getFamilyRoster } from '$lib/server/db/actions/families';
import type { EventInvite } from '$lib/server/db/actions/events';

/**
 * Turns a request's `attendees` payload into validated EventInvite rows.
 *
 * Accepted shapes (mixed allowed):
 *   - "Jane"            → guest (name) invite, always optional
 *   - { value, isUser } → if `isUser` and the value is this user or a family
 *     member, a member invite (userId). `inviteType` may be 'required'.
 * Unrecognized/unauthorized user ids are skipped (never stored as members);
 * member values are returned with their requested inviteType.
 */
export async function resolveEventInvites(userId: string, raw: unknown): Promise<EventInvite[]> {
	if (!Array.isArray(raw) || raw.length === 0) return [];

	const familyId = await getUserFamilyId(userId);
	let knownUserIds: Set<string> | null = null;
	if (familyId) {
		const roster = await getFamilyRoster(familyId);
		knownUserIds = new Set(roster.map((m) => m.userId));
	}

	const out: EventInvite[] = [];
	for (const entry of raw) {
		if (typeof entry === 'string') {
			const name = entry.trim();
			if (!name) continue;
			out.push({ name, inviteType: 'optional' });
			continue;
		}
		if (!entry || typeof entry !== 'object') continue;
		const { value, isUser, inviteType } = entry as { value?: unknown; isUser?: unknown; inviteType?: unknown };
		if (typeof value !== 'string' || !value.trim()) continue;
		const v = value.trim();
		const type = inviteType === 'required' ? 'required' : 'optional';
		if (isUser === true) {
			const isKnown = v === userId || (knownUserIds !== null && knownUserIds.has(v));
			if (isKnown) out.push({ userId: v, inviteType: type });
			else out.push({ name: v, inviteType: 'optional' });
		} else {
			out.push({ name: v, inviteType: 'optional' });
		}
	}
	return out;
}