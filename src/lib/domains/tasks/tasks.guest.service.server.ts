/**
 * tasks guest merge: handing a departing Anonymous Account's Tasks to the
 * account that signs in after it.
 *
 * The rule is the legacy `mergeGuestIntoUser` (`guestMergeService.ts:74-77`)
 * reduced to tasks' half: every Task the guest owns moves to the target —
 * owner column only, so ids, tags, completion history and assignments survive.
 * Family Tasks are untouched (the guest never owned one: it had no family).
 *
 * The caller owns the transaction (`access`' guest merge opens one `withTx`
 * and passes its ctx in), which is why nothing here starts one: the move must
 * commit or roll back with the event move and the row deletes beside it.
 *
 * Doc: ./README.md#invariants
 */
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { countTasksOwnedBy, moveTasksOwnedBy } from './tasks.repo.server';

export type MoveGuestTasksInput = {
	/** The Anonymous Account whose Tasks move. */
	readonly from: string;
	/** The account that keeps them. */
	readonly to: string;
};

/** Moves the guest's Tasks to the target and answers how many moved. */
export async function moveGuestTasks(
	ctx: Ctx,
	input: MoveGuestTasksInput
): Promise<number> {
	if (input.from === input.to) return 0;
	return await moveTasksOwnedBy(ctx.db, { from: input.from, to: input.to });
}

/** How many Tasks one person owns — the `/merge-guest` prompt's count. */
export async function countGuestTasks(ctx: Ctx, userId: string): Promise<number> {
	return await countTasksOwnedBy(ctx.db, userId);
}
