/**
 * access guest merge: what happens to an Anonymous Account's data when a real
 * person signs in on the same browser.
 *
 * Ported from `services/guestMergeService.ts` and the `/merge-guest` page's two
 * actions: a sign-in stashes the arriving guest's id in the `guest_merge`
 * cookie (`stashGuestFromCookies`), the page shows the counts and asks, and
 * `merge` keeps them while `skip` keeps nothing. The cookie alone never
 * authorises anything — the guest row must still exist and still be anonymous
 * when this runs, which is why the row is re-read inside the transaction.
 *
 * Keeping is ONE transaction in the legacy order: ensure the target's Personal
 * Calendar and move every Event onto it (ids preserved), move every Task, kill
 * the guest's sessions, then delete the guest row. Same person, a non-guest id
 * or a missing row is a zero-count no-op, never an error.
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { withTx } from '$lib/kernel/db/database.server';
import type { Cookies } from '@sveltejs/kit';
import { countGuestEvents, moveGuestEvents } from '$lib/domains/calendar/index.server';
import {
	deletePerson,
	endAllSessions,
	getPersonById,
	SESSION_COOKIE_NAME,
	validateSession
} from '$lib/domains/identity/index.server';
import { countGuestTasks, moveGuestTasks } from '$lib/domains/tasks/index.server';
import { isGuestPerson } from './access.person.rules';

/** The stash cookie a sign-in writes and `/merge-guest` reads (`guestMergeService.ts:9`). */
export const GUEST_MERGE_COOKIE = 'guest_merge';

/** The stash lives 15 minutes (`guestMergeService.ts:29`). */
export const GUEST_MERGE_MAX_AGE_SECONDS = 15 * 60;

/**
 * Called at the top of every sign-in route (`guestMergeService.ts:16-32`): when
 * the request's own session belongs to an Anonymous Account, remember its id in
 * a short-lived cookie so the merge prompt can fire once the person is signed in.
 * Bookkeeping never blocks a sign-in, so any failure is swallowed.
 */
export async function stashGuestFromCookies(
	ctx: Ctx,
	cookies: Pick<Cookies, 'get' | 'set'>
): Promise<void> {
	try {
		const { person } = await validateSession(ctx, cookies.get(SESSION_COOKIE_NAME));
		if (!person || !isGuestPerson(person)) return;
		cookies.set(GUEST_MERGE_COOKIE, person.id, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: GUEST_MERGE_MAX_AGE_SECONDS
		});
	} catch {
		// Never block login because of stash bookkeeping.
	}
}

/** True while the stashed id is still an Anonymous Account that may be merged. */
export async function isClaimableGuest(ctx: Ctx, guestId: string): Promise<boolean> {
	const person = await getPersonById(ctx, guestId);
	return person !== null && isGuestPerson(person);
}

/** How much the guest would bring along (`guestMergeService.ts:41-52`). */
export async function guestDataCounts(ctx: Ctx, guestId: string): Promise<MergeGuestCounts> {
	return {
		events: await countGuestEvents(ctx, guestId),
		tasks: await countGuestTasks(ctx, guestId)
	};
}

/** How many rows the merge handed over; both zero when it did nothing. */
export type MergeGuestCounts = {
	readonly events: number;
	readonly tasks: number;
};

export type MergeGuestInput = {
	/** The id the sign-in stash carried; null when there is no stash. */
	readonly guestId: string | null;
	/** The person's answer: keep the guest's data, or only forget the stash. */
	readonly keep: boolean;
};

/**
 * The `/merge-guest` action: `keep:false` forgets the stash (the page clears
 * the cookie and the guest row stays untouched, exactly like the legacy
 * `skip`), and `keep:true` moves the guest's Events and Tasks, ends its
 * sessions and deletes its row in one transaction.
 */
export async function mergeGuest(
	ctx: Ctx,
	actor: Actor,
	input: MergeGuestInput
): Promise<MergeGuestCounts> {
	const nothing: MergeGuestCounts = { events: 0, tasks: 0 };
	if (!input.keep) return nothing;
	const guestId = input.guestId;
	if (!guestId || guestId === actor.id) return nothing;

	return await withTx(ctx, async (txCtx) => {
		// Re-read inside the transaction: a concurrent merge must not move twice.
		const guest = await getPersonById(txCtx, guestId);
		if (!guest || !isGuestPerson(guest)) return nothing;

		const events = await moveGuestEvents(txCtx, { from: guest.id, to: actor.id });
		const tasks = await moveGuestTasks(txCtx, { from: guest.id, to: actor.id });
		await endAllSessions(txCtx, guest.id);
		await deletePerson(txCtx, {
			id: guest.id,
			email: guest.email,
			isAdmin: false,
			via: 'session'
		});
		return { events, tasks };
	});
}
