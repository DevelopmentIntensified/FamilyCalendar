/**
 * calendar invites service: the roster-aware half of invitation resolution.
 *
 * `calendar.invites.rules.ts` owns the pure normalizer — a known member id
 * becomes a member invite, an unrecognized id is dropped (never stored as a
 * guest name, #274), guests are always optional. This file supplies the one
 * thing the rule cannot know: the viewer's family roster, read through
 * `family` exactly as legacy `resolveEventInvites` did (`getUserFamilyId` +
 * `getFamilyRoster`). The roster read is skipped when there is nothing to
 * resolve, as legacy returned early.
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { listFamilyRoster, resolveMembershipFamilyId } from '$lib/domains/family/index.server';
import type { CalendarEventCreateBody } from './calendar.contract';
import { resolveInvites, type EventInvite } from './calendar.invites.rules';

/** The wire's unparsed attendee list; `resolveInvites` decodes every entry. */
export type EventInvitePayload = NonNullable<CalendarEventCreateBody['attendees']>;

/**
 * Turn a request's `attendees` (or legacy `attendants`) payload into validated
 * invites. A non-array or an empty list answers `[]` without a roster read.
 */
export async function resolveEventInvites(
	ctx: Ctx,
	actor: Actor,
	raw: EventInvitePayload | undefined
): Promise<EventInvite[]> {
	if (!Array.isArray(raw) || raw.length === 0) return [];

	const familyId = await resolveMembershipFamilyId(ctx, actor.id);
	let rosterUserIds: readonly string[] | null = null;
	if (familyId) {
		const roster = await listFamilyRoster(ctx, actor, familyId);
		rosterUserIds = roster.members.map((member) => member.userId);
	}

	return resolveInvites(raw, { userId: actor.id, rosterUserIds });
}
