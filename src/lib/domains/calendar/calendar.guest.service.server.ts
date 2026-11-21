/**
 * calendar guest merge: handing a departing Anonymous Account's Events to the
 * account that signs in after it.
 *
 * The rule is the legacy `mergeGuestIntoUser` (`guestMergeService.ts:55-86`)
 * reduced to calendar's half: the target's Personal Calendar is ensured first
 * (family calendars are never picked), then every Event the guest owns moves
 * onto it — owner and calendar change, ids survive, so checklist links and the
 * family-mirror pairing stay intact.
 *
 * The caller owns the transaction (`access`' guest merge opens one
 * `withTx` and passes its ctx in), which is why nothing here starts one: the
 * move must commit or roll back with the session and user deletes beside it.
 *
 * Doc: ./README.md#invariants
 */
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { ensurePersonalCalendarRow, moveEventsOwnedBy } from './calendar.repo.server';

export type MoveGuestEventsInput = {
	/** The Anonymous Account whose Events move. */
	readonly from: string;
	/** The account that keeps them. */
	readonly to: string;
};

/**
 * Moves the guest's Events onto the target's Personal Calendar and answers how
 * many moved. Same person, or no personal calendar to land on, moves nothing.
 */
export async function moveGuestEvents(
	ctx: Ctx,
	input: MoveGuestEventsInput
): Promise<number> {
	if (input.from === input.to) return 0;
	const personal = await ensurePersonalCalendarRow(ctx.db, input.to, ctx.clock.now());
	if (!personal) return 0;
	return await moveEventsOwnedBy(ctx.db, {
		from: input.from,
		to: input.to,
		calendarId: personal.id
	});
}
