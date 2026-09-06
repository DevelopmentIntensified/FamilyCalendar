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
/** An attendee entry object from the request payload; fields unvalidated. */
interface AttendeeEntry {
	value?: unknown;
	isUser?: unknown;
	inviteType?: unknown;
}

/** True when the attendee entry is a plain guest-name string. */
function isNameEntry(entry: unknown): entry is string {
	return typeof entry === 'string';
}

/** True when the attendee entry is an object ({ value, isUser, inviteType }). */
function isObjectEntry(entry: unknown): entry is AttendeeEntry {
	return typeof entry === 'object' && entry !== null;
}

/** True for a usable attendee value: a non-blank string. */
function isAttendeeValue(value: unknown): value is string {
	return typeof value === 'string';
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- boundary parser: request attendee payloads arrive unvalidated; non-arrays mean "no invites".
export async function resolveEventInvites(userId: string, raw: unknown): Promise<EventInvite[]> {
	if (!Array.isArray(raw)) return [];
	if (raw.length === 0) return [];

	const familyId = await getUserFamilyId(userId);
	let knownUserIds: Set<string> | null = null;
	if (familyId) {
		const roster = await getFamilyRoster(familyId);
		knownUserIds = new Set(roster.map((m) => m.userId));
	}

	const out: EventInvite[] = [];
	for (const entry of raw) {
		if (isNameEntry(entry)) {
			const name = entry.trim();
			if (!name) continue;
			out.push({ name, inviteType: 'optional' });
			continue;
		}
		if (!entry || !isObjectEntry(entry)) continue;
		const { value, isUser, inviteType } = entry;
		if (!isAttendeeValue(value) || !value.trim()) continue;
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
