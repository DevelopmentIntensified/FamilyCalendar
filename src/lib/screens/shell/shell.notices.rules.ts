/**
 * shell notice rules: the Anonymous Account countdown, the one top-notice
 * precedence chain and the guest-merge sentence.
 *
 * The legacy chain lived inline in `(calendar)/calendar/+layout.svelte:51-80`
 * as four `$derived` values and a render-time `else-if`; here it is one rule
 * over (search params, viewer, days left, dismissals), so the countdown and
 * the banner copy cannot drift apart. "Now" is a parameter (R5).
 *
 * `viewer.isAnonymous` comes from identity's `isAnonymousAccount` — shell must
 * not re-implement the placeholder-email rule (the marker's one home).
 *
 * Doc: ./README.md#invariants
 */
import type { ShellNoticeKind, ShellNoticeModel } from './shell.contract';

/** The Inactivity Window: a guest's data is deleted after this many idle days. */
const INACTIVITY_WINDOW_DAYS = 90;

/** A notice turns red at this many days left or fewer. */
const URGENT_DAYS_LEFT = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The viewer fields the notice rule reads; `isAnonymous` is identity's predicate's answer. */
type ShellNoticeViewer = {
	readonly isAnonymous: boolean;
	readonly emailVerified: boolean | null;
};

/** Which notices the frame has dismissed in this mount (the anonymous one never can be). */
type ShellNoticeDismissals = Partial<Record<ShellNoticeKind, boolean>>;

/**
 * Days left in the 90-day Inactivity Window, from `lastActiveAt`: rounded up,
 * floored at 0, and 90 when the row has no timestamp
 * (`(calendar)/calendar/+layout.svelte:51-58`). A timestamp in the future
 * counts up (the legacy math does the same); nothing writes one.
 */
export function shellDaysLeft(lastActiveAt: Date | null | undefined, now: Date): number {
	if (!lastActiveAt) return INACTIVITY_WINDOW_DAYS;
	const elapsed = now.getTime() - lastActiveAt.getTime();
	return Math.max(0, Math.ceil(INACTIVITY_WINDOW_DAYS - elapsed / DAY_MS));
}

/**
 * The first matching notice, or `null`:
 *
 * 1. `?claimed=1` and registered — the email was just added;
 * 2. an unverified password signup (`emailVerified === false`);
 * 3. `?merged=N` and registered — the guest calendar was merged;
 * 4. an Anonymous Account — the countdown, never dismissible.
 *
 * A guest never sees claimed/merged (they have no email to claim with), and
 * the countdown outranks nothing: if a dismissable notice is still up it wins,
 * exactly as the legacy `else-if` chain did (`+layout.svelte:59-80,149-264`).
 * `merged` must parse to a finite count >= 0; `tasks` only matters when > 0,
 * so junk and negatives read as 0.
 */
export function shellNoticeFor(input: {
	readonly searchParams: Pick<URLSearchParams, 'get'>;
	readonly viewer: ShellNoticeViewer;
	readonly daysLeft: number;
	readonly dismissed?: ShellNoticeDismissals;
}): ShellNoticeModel | null {
	const { searchParams, viewer, daysLeft, dismissed = {} } = input;
	const isAnonymous = viewer.isAnonymous;

	const justClaimed = searchParams.get('claimed') === '1' && !isAnonymous;
	const needsVerify = !isAnonymous && viewer.emailVerified === false;
	const mergedCount = mergedEventCount(searchParams.get('merged'));
	const justMerged = mergedCount !== null && !isAnonymous;

	if (justClaimed && !dismissed.claimed) return { kind: 'claimed', dismissible: true };
	if (needsVerify && !dismissed.verify) return { kind: 'verify', dismissible: true };
	if (justMerged && mergedCount !== null && !dismissed.merged) {
		return {
			kind: 'merged',
			dismissible: true,
			events: mergedCount,
			tasks: mergedTaskCount(searchParams.get('tasks'))
		};
	}
	if (isAnonymous) {
		return {
			kind: 'anonymous',
			dismissible: false,
			urgent: daysLeft <= URGENT_DAYS_LEFT,
			daysLeft
		};
	}
	return null;
}

/**
 * The guest-merge sentence: `Brought over N events ... from your guest
 * calendar.`, pluralised, with tasks mentioned only when some came over
 * (`+layout.svelte:227-246`). The ✅ and the dismiss button are presentation.
 */
export function shellMergeSummary(events: number, tasks: number): string {
	const eventCount = `${events} ${events === 1 ? 'event' : 'events'}`;
	const taskCount = tasks > 0 ? ` and ${tasks} ${tasks === 1 ? 'task' : 'tasks'}` : '';
	return `Brought over ${eventCount}${taskCount} from your guest calendar.`;
}

/**
 * Legacy `parseInt(searchParams.get('merged') || '')`: a finite, non-negative
 * count, else null. `parseInt` keeps its legacy radix inference ("0x10" is 16)
 * and its truncation ("3.7" is 3).
 */
function mergedEventCount(raw: string | null): number | null {
	const parsed = Number.parseInt(raw || '');
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Legacy `parseInt(searchParams.get('tasks') || '0')`, read only when > 0. */
function mergedTaskCount(raw: string | null): number {
	const parsed = Number.parseInt(raw || '0');
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
