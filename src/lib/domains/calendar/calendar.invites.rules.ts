/**
 * Invitations, ported from `events.ts` (`normalizeInvites`) and
 * `eventInvites.ts` (`resolveEventInvites`). The roster is a parameter here —
 * the service fetches it — so the rule stays pure.
 *
 * Structured `attendees` are preferred over legacy `attendants` names; a known
 * member id becomes a member invite; an unrecognized id is dropped (never
 * stored as a guest name); guests are always optional (#274).
 *
 * Doc: ./README.md#invariants
 */
export type InviteType = 'required' | 'optional';

/** A member invitation (`userId`) or a named guest (`name`). */
export interface EventInvite {
	readonly userId?: string | null;
	readonly name?: string | null;
	readonly inviteType: InviteType;
}

/** An attendee entry object from the request payload; fields unvalidated. */
interface AttendeeEntry {
	value?: unknown;
	isUser?: unknown;
	inviteType?: unknown;
}

function isInviteName(entry: unknown): entry is string {
	return typeof entry === 'string';
}

function isInviteObject(entry: unknown): entry is Partial<EventInvite> {
	return typeof entry === 'object' && entry !== null;
}

/** True when the raw entry is an attendee object (`{ value, isUser, inviteType }`). */
function isAttendeeEntry(entry: unknown): entry is AttendeeEntry {
	return typeof entry === 'object' && entry !== null && !Array.isArray(entry);
}

function confirmedType(type: unknown): InviteType {
	return type === 'required' ? 'required' : 'optional';
}

/** True when the value is the caller or a member of their family roster. */
export function isKnownInvitee(
	value: string,
	userId: string,
	rosterUserIds: readonly string[] | null
): boolean {
	return value === userId || (rosterUserIds !== null && rosterUserIds.includes(value));
}

/**
 * Normalize a mix of legacy guest-name strings and structured invites. A
 * member id sent as a guest name is still that member only when the roster is
 * known — this normalizer has no roster, so it keeps the legacy
 * `{userId}`/`{name}` split exactly.
 */
export function normalizeInvites(raw: unknown): EventInvite[] {
	if (!Array.isArray(raw)) return [];
	const invites: EventInvite[] = [];
	for (const entry of raw) {
		if (isInviteName(entry)) {
			const name = entry.trim();
			if (name) invites.push({ name, inviteType: 'optional' });
		} else if (entry && isInviteObject(entry)) {
			if (entry.userId) {
				invites.push({ userId: entry.userId, inviteType: confirmedType(entry.inviteType) });
			} else if (entry.name && isInviteName(entry.name) && entry.name.trim()) {
				invites.push({ name: entry.name.trim(), inviteType: 'optional' });
			}
		}
	}
	return invites;
}

/**
 * Turn a request's `attendees` payload into validated invites. Accepts:
 *   - `"Jane"` — guest, unless the name is a known member id (#274);
 *   - `{ value, isUser }` — a roster member when `isUser` is true, a guest
 *     otherwise. `inviteType` may be `required` for members.
 * Unrecognized user ids are dropped entirely: a raw id must never render as an
 * attendee name.
 *
 * `rosterUserIds` is the viewer's family roster, or null when they have none.
 */
export function resolveInvites(
	raw: unknown,
	context: { readonly userId: string; readonly rosterUserIds: readonly string[] | null }
): EventInvite[] {
	if (!Array.isArray(raw)) return [];
	const { userId, rosterUserIds } = context;
	const invites: EventInvite[] = [];

	for (const entry of raw) {
		if (isInviteName(entry)) {
			const name = entry.trim();
			if (!name) continue;
			invites.push(
				isKnownInvitee(name, userId, rosterUserIds)
					? { userId: name, inviteType: 'optional' }
					: { name, inviteType: 'optional' }
			);
			continue;
		}
		if (!isAttendeeEntry(entry)) continue;
		const { value, isUser, inviteType } = entry;
		if (typeof value !== 'string' || !value.trim()) continue;
		const trimmed = value.trim();
		const type = confirmedType(inviteType);
		if (isUser === true) {
			if (isKnownInvitee(trimmed, userId, rosterUserIds)) {
				invites.push({ userId: trimmed, inviteType: type });
			}
		} else if (isKnownInvitee(trimmed, userId, rosterUserIds)) {
			// #274: a rosterless edit form flagged a member as a guest.
			invites.push({ userId: trimmed, inviteType: type });
		} else {
			invites.push({ name: trimmed, inviteType: 'optional' });
		}
	}
	return invites;
}
